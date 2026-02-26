import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { TelegramService } from '@/lib/services/telegramService'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const BATCH_LIMIT = 50
const DELAY_BETWEEN_MS = 200

/**
 * POST /api/participants/batch-sync-usernames
 * Fetches Telegram usernames via getChatMember for participants that have
 * tg_user_id but no tg_username. Triggered when members list opens.
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

    const { data: orgGroups } = await supabase
      .from('org_telegram_groups')
      .select('tg_chat_id')
      .eq('org_id', orgId)

    if (!orgGroups || orgGroups.length === 0) {
      return NextResponse.json({ updated: 0, skipped: 0, failed: 0 })
    }

    const tgChatIds = orgGroups.map((g: any) => g.tg_chat_id)

    const ids = participantIds.slice(0, BATCH_LIMIT)

    const { data: participants } = await supabase
      .from('participants')
      .select('id, tg_user_id, tg_username, org_id')
      .in('id', ids)
      .eq('org_id', orgId)
      .is('merged_into', null)

    if (!participants || participants.length === 0) {
      return NextResponse.json({ updated: 0, skipped: 0, failed: 0 })
    }

    const needSync = participants.filter(
      (p: any) => p.tg_user_id && !p.tg_username
    )

    if (needSync.length === 0) {
      return NextResponse.json({ updated: 0, skipped: 0, failed: 0 })
    }

    logger.info({ org_id: orgId, need_sync: needSync.length }, 'Batch username sync started')

    const botTypes: Array<'main' | 'notifications' | 'event'> = ['main', 'notifications', 'event']
    let updated = 0
    let skipped = 0
    let failed = 0

    for (const participant of needSync) {
      try {
        const tgUserId = Number(participant.tg_user_id)
        let username: string | null = null

        for (const chatId of tgChatIds) {
          for (const botType of botTypes) {
            try {
              const tg = new TelegramService(botType)
              const resp = await tg.getChatMember(chatId, tgUserId)
              if (resp.ok && resp.result?.user?.username) {
                username = resp.result.user.username
                break
              }
              if (resp.ok) break
            } catch {
              continue
            }
          }
          if (username) break
        }

        if (username) {
          await supabase
            .from('participants')
            .update({ tg_username: username, updated_at: new Date().toISOString() })
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
