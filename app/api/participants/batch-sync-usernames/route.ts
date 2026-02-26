import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { TelegramService } from '@/lib/services/telegramService'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const BATCH_LIMIT = 100
const DELAY_BETWEEN_MS = 150

/**
 * POST /api/participants/batch-sync-usernames
 * Fetches Telegram usernames and bios via getChatMember + getChat for
 * participants with tg_user_id but no tg_username. Triggered on members list open.
 */
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/participants/batch-sync-usernames' })

  try {
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId, participantIds } = await request.json()
    if (!orgId || !Array.isArray(participantIds) || participantIds.length === 0) {
      return NextResponse.json({ error: 'orgId and participantIds required' }, { status: 400 })
    }

    const supabase = createAdminServer()

    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const ids = participantIds.slice(0, BATCH_LIMIT)

    const { data: participants } = await supabase
      .from('participants')
      .select('id, tg_user_id, username, bio, org_id')
      .in('id', ids)
      .eq('org_id', orgId)
      .is('merged_into', null)

    if (!participants || participants.length === 0) {
      return NextResponse.json({ updated: 0, skipped: 0, failed: 0 })
    }

    const needSync = participants.filter(
      (p: any) => p.tg_user_id && Number(p.tg_user_id) > 0 && (!p.username || !p.bio)
    )

    if (needSync.length === 0) {
      logger.info({ org_id: orgId, total: ids.length }, 'Batch username sync: all already synced')
      return NextResponse.json({ updated: 0, skipped: 0, failed: 0 })
    }

    // Load each participant's actual groups to avoid querying all org groups
    const syncParticipantIds = needSync.map((p: any) => p.id)
    const { data: participantGroupLinks } = await supabase
      .from('participant_groups')
      .select('participant_id, tg_group_id')
      .in('participant_id', syncParticipantIds)
      .is('left_at', null)

    const participantGroupMap = new Map<string, number[]>()
    for (const link of participantGroupLinks || []) {
      const groups = participantGroupMap.get(link.participant_id) || []
      groups.push(Number(link.tg_group_id))
      participantGroupMap.set(link.participant_id, groups)
    }

    logger.info({ org_id: orgId, need_sync: needSync.length, total: ids.length }, 'Batch username sync started')

    const botTypes: Array<'main' | 'notifications' | 'event'> = ['main', 'notifications', 'event']
    let updated = 0
    let skipped = 0
    let failed = 0

    for (const participant of needSync) {
      try {
        const tgUserId = Number(participant.tg_user_id)
        let username: string | null = null
        let bio: string | null = null

        const participantChatIds = participantGroupMap.get(participant.id) || []

        if (!participant.username && participantChatIds.length > 0) {
          for (const chatId of participantChatIds) {
            for (const botType of botTypes) {
              try {
                const tg = new TelegramService(botType)
                const resp = await tg.getChatMember(chatId, tgUserId)
                if (resp.ok && resp.result?.user) {
                  if (resp.result.user.username) {
                    username = resp.result.user.username
                  }
                  break
                }
                if (resp.ok) break
              } catch {
                continue
              }
            }
            if (username) break
          }
        }

        if (!participant.bio) {
          for (const botType of botTypes) {
            try {
              const tg = new TelegramService(botType)
              const chatResp = await tg.getChat(tgUserId)
              if (chatResp.ok && chatResp.result?.bio) {
                bio = chatResp.result.bio.substring(0, 60)
                break
              }
              if (chatResp.ok) break
            } catch {
              continue
            }
          }
        }

        const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
        if (username && !participant.username) updateData.username = username
        if (bio && !participant.bio) updateData.bio = bio

        if (Object.keys(updateData).length > 1) {
          await supabase
            .from('participants')
            .update(updateData)
            .eq('id', participant.id)
          updated++
        } else {
          skipped++
        }
      } catch {
        failed++
      }

      if (needSync.indexOf(participant) < needSync.length - 1) {
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_MS))
      }
    }

    logger.info({ org_id: orgId, updated, skipped, failed }, 'Batch username sync complete')
    return NextResponse.json({ updated, skipped, failed })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    logger.error({ error: msg }, 'Batch username sync error')
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
