import { NextRequest, NextResponse } from 'next/server'
import { createServiceLogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const logger = createServiceLogger('TelegramAuthIssueReport')

/**
 * POST /api/auth/telegram-code/report-issue
 *
 * Пользователь нажал «Сообщить о проблеме» на странице ввода 6-значного кода.
 * Логируем как warn — в отличие от info-логов, warn-записи попадают в дайджест
 * и обращают на себя внимание суперадмина. Никаких данных не меняем.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { code, orgId, eventId, userAgent } = body as {
      code?: string
      orgId?: string
      eventId?: string
      userAgent?: string
    }

    logger.warn(
      {
        code: code || 'unknown',
        org_id: orgId || null,
        event_id: eventId || null,
        user_agent: userAgent?.slice(0, 200) || null,
      },
      'User reported Telegram auth issue: bot did not respond to auth code'
    )

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
}
