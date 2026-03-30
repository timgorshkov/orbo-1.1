import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('TelegramGroupTopicsAPI')

export const dynamic = 'force-dynamic'

/**
 * GET /api/telegram/groups/topics?tgChatId=<id>&orgId=<orgId>
 *
 * Returns forum topics known for a Telegram group.
 * Primary source: `telegram_topics` table.
 * Fallback: infer from recent `telegram_activity_events` message_thread_id values.
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

  try {
    const db = createAdminServer()
    const numericChatId = Number(tgChatId)
    const chatFilter = Number.isFinite(numericChatId) ? numericChatId : tgChatId

    // Primary: telegram_topics table
    const { data: topicRows, error: topicsError } = await db
      .from('telegram_topics')
      .select('id, title, tg_chat_id')
      .eq('tg_chat_id', chatFilter)
      .order('title', { ascending: true })

    if (!topicsError && topicRows && topicRows.length > 0) {
      return NextResponse.json({ topics: topicRows })
    }

    // Fallback: infer from activity events
    const { data: activityRows, error: activityError } = await db
      .from('telegram_activity_events')
      .select('message_thread_id, thread_title, meta')
      .eq('tg_chat_id', chatFilter)
      .not('message_thread_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(500)

    if (activityError || !activityRows || activityRows.length === 0) {
      return NextResponse.json({ topics: [] })
    }

    const topicMap = new Map<string, string>()
    activityRows.forEach((row: any) => {
      const meta = row?.meta || {}
      const threadIdRaw = row?.message_thread_id ?? meta?.message_thread_id ?? null
      const threadTitle = (row?.thread_title ?? meta?.thread_title)?.toString().trim() || null
      if (threadIdRaw == null) return
      const key = String(threadIdRaw)
      if (!topicMap.has(key)) {
        topicMap.set(key, threadTitle || `Тема ${key}`)
      }
    })

    const topics = Array.from(topicMap.entries()).map(([id, title]) => ({
      id: Number(id),
      title,
      tg_chat_id: Number(tgChatId),
    }))

    return NextResponse.json({ topics })
  } catch (err: any) {
    logger.error({ error: err.message }, 'Error in GET /api/telegram/groups/topics')
    return NextResponse.json({ topics: [] })
  }
}
