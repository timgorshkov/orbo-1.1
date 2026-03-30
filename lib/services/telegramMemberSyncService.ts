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

import { TelegramClient, StringSession, Api } from 'telegram'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('TelegramMemberSync')

// System accounts that Telegram injects into every group — skip them
const SYSTEM_TG_IDS = new Set([777000, 136817688, 1087968824, 93372553])

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
      return markFailed(`Could not resolve entity for chat ${tgChatId}. Make sure the service account is a member of this group.`)
    }

    // Fetch participants using pagination
    const PAGE_SIZE = 200
    let offset = 0
    let totalCount = 0
    let syncedCount = 0
    let newCount = 0
    let hasMore = true

    while (hasMore) {
      let participants: Api.TypeUser[] = []
      let fetchedCount = 0

      try {
        // For supergroups and channels
        const result = await client.invoke(
          new Api.channels.GetParticipants({
            channel: entity as Api.TypeInputChannel,
            filter: new Api.ChannelParticipantsSearch({ q: '' }),
            offset,
            limit: PAGE_SIZE,
            hash: BigInt(0),
          })
        ) as Api.channels.ChannelParticipants

        totalCount = result.count
        participants = result.users as Api.TypeUser[]
        fetchedCount = result.participants.length

        // Update total on first page
        if (offset === 0) {
          await db
            .from('telegram_member_sync_jobs')
            .update({ total_members: totalCount })
            .eq('id', jobId)
        }
      } catch (err: any) {
        if (err.errorMessage === 'CHAT_INVALID' || err.errorMessage === 'CHANNEL_INVALID') {
          // Try basic group API
          try {
            const fullChat = await client.invoke(
              new Api.messages.GetFullChat({ chatId: Math.abs(tgChatId) })
            ) as Api.messages.ChatFull

            const fullChatInfo = fullChat.fullChat as Api.ChatFull
            const chatParticipants = (fullChatInfo as any).participants as Api.ChatParticipants
            participants = fullChat.users as Api.TypeUser[]
            fetchedCount = participants.length
            totalCount = participants.length
            hasMore = false // Basic groups return everything at once

            if (offset === 0) {
              await db
                .from('telegram_member_sync_jobs')
                .update({ total_members: totalCount })
                .eq('id', jobId)
            }
          } catch (innerErr: any) {
            return markFailed(`Cannot read group members: ${innerErr.errorMessage || innerErr.message}`)
          }
        } else if (err.errorMessage?.includes('FLOOD_WAIT')) {
          const waitSec = parseInt(err.errorMessage.replace('FLOOD_WAIT_', '')) || 30
          logger.warn({ job_id: jobId, wait_sec: waitSec }, 'FloodWait, pausing')
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
        if (user.bot) continue // skip bots

        const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || `User ${tgUserId}`
        const username = user.username ?? null

        try {
          // Upsert participant
          const { data: participant } = await db
            .from('participants')
            .upsert({
              org_id: orgId,
              tg_user_id: tgUserId,
              username,
              full_name: fullName,
              tg_first_name: user.firstName ?? null,
              tg_last_name: user.lastName ?? null,
              source: 'service_account_sync',
              status: 'active',
              participant_status: 'participant',
            }, { onConflict: 'org_id,tg_user_id' })
            .select('id')
            .single()

          if (participant) {
            // Upsert participant_groups link
            const { error: pgError } = await db
              .from('participant_groups')
              .upsert({
                participant_id: participant.id,
                tg_group_id: tgChatId,
                org_id: orgId,
                joined_at: new Date().toISOString(),
              }, { onConflict: 'participant_id,tg_group_id' })

            if (!pgError) {
              newCount++ // Simplification: count all upserted as "processed"
            }
          }

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

    logger.info({ job_id: jobId, synced: syncedCount, new_members: newCount }, 'Sync job completed')
  } catch (err: any) {
    markFailed(err.message || 'Unknown error')
  }
}
