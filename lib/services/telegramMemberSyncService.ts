/**
 * Telegram Member Sync Service
 *
 * Fetches ALL members of a Telegram group (including lurkers) via MTProto
 * using a service account (user API, not bot API).
 *
 * Bot API limitation: getChatAdministrators only returns admins.
 * MTProto allows fetching the full member list via channels.GetParticipants.
 *
 * Requirements:
 *   TG_SERVICE_API_ID      – from my.telegram.org
 *   TG_SERVICE_API_HASH    – from my.telegram.org
 *   TG_SERVICE_SESSION     – generated once via scripts/setup-tg-session.ts
 */

import { TelegramClient, sessions, Api } from 'telegram'
const { StringSession } = sessions
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('TelegramMemberSync')

// System accounts that Telegram injects into every group + our service account — skip them
const SYSTEM_TG_IDS = new Set([777000, 136817688, 1087968824, 93372553, 8586374728])

// ── Client singleton ──────────────────────────────────────────────────────────

let _client: TelegramClient | null = null

async function getClient(): Promise<TelegramClient> {
  if (_client?.connected) return _client

  const apiId = parseInt(process.env.TG_SERVICE_API_ID || '0', 10)
  const apiHash = process.env.TG_SERVICE_API_HASH || ''
  const sessionStr = process.env.TG_SERVICE_SESSION || ''

  if (!apiId || !apiHash || !sessionStr) {
    throw new Error('TG_SERVICE_API_ID, TG_SERVICE_API_HASH, TG_SERVICE_SESSION are not configured')
  }

  const client = new TelegramClient(
    new StringSession(sessionStr),
    apiId,
    apiHash,
    {
      connectionRetries: 3,
      useWSS: false,
    }
  )

  await client.connect()
  _client = client
  logger.info('MTProto client connected')
  return client
}

// ── Public: is the service account configured ─────────────────────────────────

export function isServiceAccountConfigured(): boolean {
  return !!(
    process.env.TG_SERVICE_API_ID &&
    process.env.TG_SERVICE_API_HASH &&
    process.env.TG_SERVICE_SESSION
  )
}

// ── Public: start a sync job ──────────────────────────────────────────────────

export async function startMemberSyncJob(
  orgId: string,
  tgChatId: number,
  userId: string
): Promise<{ jobId: string }> {
  const db = createAdminServer()

  // Cancel any existing running/pending job for this group
  await db
    .from('telegram_member_sync_jobs')
    .update({ status: 'failed', error: 'Replaced by newer job', completed_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('tg_chat_id', tgChatId)
    .in('status', ['pending', 'running'])

  const { data: job, error } = await db
    .from('telegram_member_sync_jobs')
    .insert({
      org_id: orgId,
      tg_chat_id: tgChatId,
      status: 'pending',
      created_by: userId,
    })
    .select('id')
    .single()

  if (error || !job) {
    throw new Error(`Failed to create sync job: ${error?.message}`)
  }

  logger.info({ job_id: job.id, org_id: orgId, tg_chat_id: tgChatId }, 'Member sync job created')

  // Fire-and-forget: run the actual sync in the background
  processSyncJob(job.id, orgId, tgChatId).catch(err => {
    logger.error({ job_id: job.id, error: err.message }, 'Sync job crashed unexpectedly')
  })

  return { jobId: job.id }
}

// ── Public: get latest job status for a group ─────────────────────────────────

export async function getLatestSyncJob(orgId: string, tgChatId: number) {
  const db = createAdminServer()
  const { data } = await db
    .from('telegram_member_sync_jobs')
    .select('id, status, total_members, synced_members, new_members, error, started_at, completed_at, created_at')
    .eq('org_id', orgId)
    .eq('tg_chat_id', tgChatId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data
}

// ── Search queries for alphabet-based participant fetching ────────────────────
// Telegram API limits channels.GetParticipants to ~10,000 results per filter/query.
// To fetch >10k members we iterate over single-character search prefixes:
// each letter gets its own 10k cap, and we deduplicate by user ID.
const SEARCH_QUERIES = [
  '', // empty query first — covers up to 10k most recent members
  ...'абвгдежзиклмнопрстуфхцчшщэюя'.split(''),
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
  ...'0123456789'.split(''),
]

// ── Core: process the sync job ────────────────────────────────────────────────

async function processSyncJob(jobId: string, orgId: string, tgChatId: number) {
  const db = createAdminServer()

  const markFailed = async (msg: string) => {
    logger.error({ job_id: jobId, error: msg }, 'Sync job failed')
    await db
      .from('telegram_member_sync_jobs')
      .update({ status: 'failed', error: msg, completed_at: new Date().toISOString() })
      .eq('id', jobId)
  }

  try {
    await db
      .from('telegram_member_sync_jobs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', jobId)

    const client = await getClient()

    // Resolve the Telegram entity (handles both basic groups and supergroups)
    const entity = await client.getInputEntity(BigInt(tgChatId)).catch(() => null)
    if (!entity) {
      return markFailed('SERVICE_NOT_IN_GROUP')
    }

    const PAGE_SIZE = 200
    let totalCount = 0
    let syncedCount = 0
    let newCount = 0

    // Set of already-seen user IDs to deduplicate across search queries
    const seenUserIds = new Set<number>()

    // Try basic group API first if supergroup fails on first attempt
    let isBasicGroup = false

    for (const searchQuery of SEARCH_QUERIES) {
      if (isBasicGroup) break // basic groups return all at once, no need for alphabet iteration

      let offset = 0
      let hasMore = true

      while (hasMore) {
        let participants: Api.TypeUser[] = []
        let fetchedCount = 0

        try {
          // MTProto invoke can silently hang on a flaky session — there's no
          // built-in timeout in gramjs's invoke. Race it ourselves so a stuck
          // call surfaces as an error instead of leaving the job 'running'
          // for hours. 90s is more than enough for a single page of 200 users.
          logger.info({ job_id: jobId, query: searchQuery, offset }, 'MTProto GetParticipants: invoking')
          const result = await Promise.race([
            client.invoke(
              new Api.channels.GetParticipants({
                channel: entity as Api.TypeInputChannel,
                filter: new Api.ChannelParticipantsSearch({ q: searchQuery }),
                offset,
                limit: PAGE_SIZE,
                hash: BigInt(0),
              })
            ),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('MTProto GetParticipants timed out after 90s')), 90_000)
            ),
          ]) as Api.channels.ChannelParticipants

          // Use server-reported total (same for all queries)
          if (result.count > totalCount) {
            totalCount = result.count
            await db
              .from('telegram_member_sync_jobs')
              .update({ total_members: totalCount })
              .eq('id', jobId)
          }

          participants = result.users as Api.TypeUser[]
          fetchedCount = result.participants.length
          logger.info({ job_id: jobId, query: searchQuery, offset, fetched: fetchedCount, total: totalCount }, 'MTProto GetParticipants: page received')
        } catch (err: any) {
          if (err.errorMessage === 'CHAT_INVALID' || err.errorMessage === 'CHANNEL_INVALID') {
            // Try basic group API (returns all members at once)
            try {
              const fullChat = await client.invoke(
                new Api.messages.GetFullChat({ chatId: Math.abs(tgChatId) })
              ) as Api.messages.ChatFull

              participants = fullChat.users as Api.TypeUser[]
              fetchedCount = participants.length
              totalCount = participants.length
              isBasicGroup = true
              hasMore = false

              await db
                .from('telegram_member_sync_jobs')
                .update({ total_members: totalCount })
                .eq('id', jobId)
            } catch (innerErr: any) {
              return markFailed(`Cannot read group members: ${innerErr.errorMessage || innerErr.message}`)
            }
          } else if (err.errorMessage?.includes('FLOOD_WAIT')) {
            const waitSec = parseInt(err.errorMessage.replace('FLOOD_WAIT_', '')) || 30
            logger.warn({ job_id: jobId, wait_sec: waitSec, query: searchQuery }, 'FloodWait, pausing')
            await new Promise(r => setTimeout(r, waitSec * 1000))
            continue
          } else {
            return markFailed(`MTProto error: ${err.errorMessage || err.message}`)
          }
        }

        // Upsert each user into participants
        for (const user of participants) {
          if (!(user instanceof Api.User)) continue
          const tgUserId = Number(user.id)
          if (SYSTEM_TG_IDS.has(tgUserId)) continue
          if (user.bot) continue
          if (seenUserIds.has(tgUserId)) continue // deduplicate across queries

          seenUserIds.add(tgUserId)

          const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || `User ${tgUserId}`
          const username = user.username ?? null

          try {
            const { data: existing } = await db
              .from('participants')
              .select('id')
              .eq('org_id', orgId)
              .eq('tg_user_id', tgUserId)
              .is('merged_into', null)
              .maybeSingle()

            let participantId: string

            if (existing) {
              participantId = existing.id
              await db
                .from('participants')
                .update({ username, full_name: fullName, tg_first_name: user.firstName ?? null, tg_last_name: user.lastName ?? null })
                .eq('id', participantId)
            } else {
              const { data: newP } = await db
                .from('participants')
                .insert({
                  org_id: orgId,
                  tg_user_id: tgUserId,
                  username,
                  full_name: fullName,
                  tg_first_name: user.firstName ?? null,
                  tg_last_name: user.lastName ?? null,
                  source: 'service_account_sync',
                  participant_status: 'participant',
                })
                .select('id')
                .single()

              if (!newP) { syncedCount++; continue }
              participantId = newP.id
              newCount++
            }

            await db
              .from('participant_groups')
              .upsert({
                participant_id: participantId,
                tg_group_id: tgChatId,
                joined_at: new Date().toISOString(),
              }, { onConflict: 'participant_id,tg_group_id' })

            syncedCount++
          } catch (upsertErr: any) {
            logger.warn({ tg_user_id: tgUserId, error: upsertErr.message }, 'Failed to upsert participant')
          }
        }

        // Update progress
        await db
          .from('telegram_member_sync_jobs')
          .update({ synced_members: syncedCount, new_members: newCount })
          .eq('id', jobId)

        offset += fetchedCount

        if (fetchedCount < PAGE_SIZE || !hasMore) {
          hasMore = false
        }

        // Small pause between pages to avoid flood
        if (hasMore) await new Promise(r => setTimeout(r, 500))
      }

      // Small pause between search queries
      if (!isBasicGroup) await new Promise(r => setTimeout(r, 300))
    }

    // ────────────────────────────────────────────────────────────────
    // Reconcile leavers: anyone that was in this group in our DB but is NOT
    // in the freshly-fetched list is no longer a member. We can't rely on
    // webhooks alone — historical leaves predating the bot, kicks bypassing
    // the bot, and brief network gaps all leave dangling participant_groups
    // rows with `left_at IS NULL`. The MTProto scan is authoritative.
    //
    // We mark via UPDATE rather than DELETE so the join_at/source/history
    // remains visible for analytics and a re-join later just clears left_at.
    // Skip when the scan returned suspiciously few users (< 50% of reported)
    // — it's safer to do nothing than mass-mark everyone "left" because of a
    // partial fetch.
    let leftMarked = 0
    if (seenUserIds.size > 0 && (totalCount === 0 || seenUserIds.size >= Math.floor(totalCount * 0.5))) {
      const seenIds = Array.from(seenUserIds)
      const { data: leftRows, error: leftErr } = await db.raw(
        `UPDATE participant_groups pg
            SET left_at = NOW(),
                is_active = FALSE
           FROM participants p
          WHERE pg.participant_id = p.id
            AND p.org_id = $1
            AND pg.tg_group_id = $2
            AND pg.left_at IS NULL
            AND p.tg_user_id IS NOT NULL
            AND NOT (p.tg_user_id = ANY($3::bigint[]))
        RETURNING pg.participant_id`,
        [orgId, tgChatId, seenIds]
      )
      if (leftErr) {
        logger.warn({ job_id: jobId, error: leftErr.message }, 'Reconcile leavers query failed')
      } else {
        leftMarked = (leftRows || []).length
        logger.info({ job_id: jobId, left_marked: leftMarked }, 'Reconciled leavers')
      }
    } else {
      logger.warn({
        job_id: jobId,
        seen: seenUserIds.size,
        reported: totalCount,
      }, 'Skipping leaver reconciliation — fetch looks partial')
    }

    logger.info({
      job_id: jobId,
      synced: syncedCount,
      new_members: newCount,
      left_marked: leftMarked,
      total_unique_fetched: seenUserIds.size,
      total_reported: totalCount
    }, 'Sync job completed')

    await db
      .from('telegram_member_sync_jobs')
      .update({
        status: 'completed',
        synced_members: syncedCount,
        new_members: newCount,
        total_members: totalCount,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId)
  } catch (err: any) {
    markFailed(err.message || 'Unknown error')
  }
}
