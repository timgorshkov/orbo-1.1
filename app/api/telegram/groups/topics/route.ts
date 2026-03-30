import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'
import { TelegramService } from '@/lib/services/telegramService'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('TelegramGroupTopicsAPI')

export const dynamic = 'force-dynamic'

/**
 * GET /api/telegram/groups/topics?tgChatId=<id>&orgId=<orgId>
 *
 * Returns forum topics known for a Telegram group.
 * Sources (in order):
 * 1. telegram_topics table — pre-populated from webhook or backfill
 * 2. Telegram Bot API getForumTopics — fetched on demand, result cached in DB
 * 3. activity_events message_thread_id — last resort (no titles)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tgChatId = searchParams.get('tgChatId')
  const orgId = searchParams.get('orgId')

  if (!tgChatId || !orgId) {
    return NextResponse.json({ error: 'tgChatId and orgId are required' }, { status: 400 })
  }

  const user = await getUnifiedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await getEffectiveOrgRole(user.id, orgId)
  if (!access) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db = createAdminServer()
  const numericChatId = Number(tgChatId)
  const chatFilter = Number.isFinite(numericChatId) ? numericChatId : tgChatId

  try {
    // 1. Load from telegram_topics table
    const { data: stored } = await db
      .from('telegram_topics')
      .select('id, title, tg_chat_id')
      .eq('tg_chat_id', chatFilter)
      .order('id', { ascending: true })

    const hasRealTitles = (stored ?? []).some(
      t => t.title && !t.title.match(/^Тема \d+$/)
    )

    // 2. Refresh titles from Bot API if we only have generic "Тема N" names
    if (!hasRealTitles) {
      try {
        const telegram = new TelegramService()
        const liveTopics = await telegram.getForumTopics(Number(tgChatId))

        if (liveTopics.length > 0) {
          // Upsert real titles
          await Promise.all(
            liveTopics.map(t =>
              db.from('telegram_topics').upsert(
                { id: t.id, tg_chat_id: Number(tgChatId), title: t.name, updated_at: new Date().toISOString() },
                { onConflict: 'id,tg_chat_id' }
              )
            )
          )

          // Also mark group as forum
          await db
            .from('telegram_groups')
            .update({ is_forum: true })
            .filter('tg_chat_id::text', 'eq', String(tgChatId))

          return NextResponse.json({
            topics: liveTopics.map(t => ({ id: t.id, title: t.name, tg_chat_id: Number(tgChatId) })),
          })
        }
      } catch (botErr: any) {
        logger.warn({ error: botErr.message, tgChatId }, 'Bot API getForumTopics failed, using cached data')
      }
    }

    // Return stored topics (may have real or generic titles)
    if ((stored ?? []).length > 0) {
      return NextResponse.json({ topics: stored })
    }

    // 3. Last resort: infer from activity_events
    const { data: activityRows } = await db
      .from('activity_events')
      .select('message_thread_id')
      .eq('tg_chat_id', chatFilter)
      .not('message_thread_id', 'is', null)
      .gt('message_thread_id', 1)
      .order('created_at', { ascending: false })
      .limit(500)

    if (!activityRows || activityRows.length === 0) {
      return NextResponse.json({ topics: [] })
    }

    const seen = new Set<number>()
    const topics = []
    for (const row of activityRows) {
      const id = Number(row.message_thread_id)
      if (!seen.has(id)) {
        seen.add(id)
        topics.push({ id, title: `Тема ${id}`, tg_chat_id: Number(tgChatId) })
      }
    }

    return NextResponse.json({ topics })
  } catch (err: any) {
    logger.error({ error: err.message }, 'Error in GET /api/telegram/groups/topics')
    return NextResponse.json({ topics: [] })
  }
}
