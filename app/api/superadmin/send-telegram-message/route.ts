import { NextRequest, NextResponse } from 'next/server'
import { requireSuperadmin } from '@/lib/server/superadminGuard'
import { createTelegramService } from '@/lib/services/telegramService'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('SuperadminSendTelegram')

export async function POST(req: NextRequest) {
  try {
    await requireSuperadmin()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { telegramUserId, message, botType = 'notifications' } = await req.json()

    if (!telegramUserId || !message?.trim()) {
      return NextResponse.json({ error: 'telegramUserId and message are required' }, { status: 400 })
    }

    const validBotTypes = ['main', 'notifications', 'event', 'registration']
    if (!validBotTypes.includes(botType)) {
      return NextResponse.json({ error: 'Invalid botType' }, { status: 400 })
    }

    const telegramService = createTelegramService(botType as any)
    const result = await telegramService.sendMessage(Number(telegramUserId), message.trim(), {
      parse_mode: 'Markdown'
    })

    if (!result.ok) {
      logger.warn({
        telegram_user_id: telegramUserId,
        bot_type: botType,
        error: result.description
      }, 'Failed to send message via bot')

      if (result.description?.includes('bot was blocked') || result.description?.includes('chat not found')) {
        return NextResponse.json({
          error: 'Пользователь не запустил бота или заблокировал его',
          code: 'BOT_BLOCKED'
        }, { status: 400 })
      }

      return NextResponse.json({ error: result.description || 'Failed to send' }, { status: 400 })
    }

    logger.info({
      telegram_user_id: telegramUserId,
      bot_type: botType,
      message_length: message.length
    }, 'Superadmin sent bot message')

    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error)
    }, 'Error in superadmin send-telegram-message')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
