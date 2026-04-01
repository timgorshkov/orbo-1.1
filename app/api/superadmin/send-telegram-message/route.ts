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

    // Try sending via multiple bots in priority order.
    // Users interact with different bots: registration (6-digit codes, onboarding),
    // main (group management), notifications. A bot can only message users who started it.
    const botPriority = ['registration', 'main', 'notifications', 'event'] as const
    // If specific bot requested, try it first
    const botsToTry = botType !== 'notifications'
      ? [botType, ...botPriority.filter(b => b !== botType)]
      : botPriority

    let lastError = ''
    let lastBotType = ''

    for (const tryBot of botsToTry) {
      try {
        const service = createTelegramService(tryBot as any)
        const result = await service.sendMessage(Number(telegramUserId), message.trim(), {})

        if (result.ok) {
          logger.info({
            telegram_user_id: telegramUserId,
            bot_type: tryBot,
            message_length: message.length,
            tried_bots: botsToTry.slice(0, botsToTry.indexOf(tryBot) + 1),
          }, 'Superadmin sent bot message')
          return NextResponse.json({ ok: true, bot_type: tryBot })
        }

        const desc = result.description || ''
        lastError = desc
        lastBotType = tryBot

        // Only retry on 'chat not found' — other errors (blocked, deactivated) are permanent
        if (!desc.includes('chat not found') && !desc.includes('user not found')) {
          break
        }
      } catch {
        // Bot token not configured — skip
        continue
      }
    }

    logger.warn({
      telegram_user_id: telegramUserId,
      tried_bots: botsToTry,
      last_bot_type: lastBotType,
      error: lastError,
    }, 'Failed to send message via any bot')

    if (lastError.includes('bot was blocked')) {
      return NextResponse.json({ error: 'Пользователь заблокировал бота', code: 'BOT_BLOCKED' }, { status: 400 })
    }
    if (lastError.includes('user is deactivated')) {
      return NextResponse.json({ error: 'Аккаунт Telegram удалён или деактивирован', code: 'USER_DEACTIVATED' }, { status: 400 })
    }
    if (lastError.includes('chat not found') || lastError.includes('user not found')) {
      return NextResponse.json({ error: 'Пользователь не запускал ни одного бота Orbo', code: 'CHAT_NOT_FOUND' }, { status: 400 })
    }
    if (lastError.includes('have no rights') || lastError.includes('not enough rights')) {
      return NextResponse.json({ error: 'Нет прав для отправки сообщения', code: 'NO_RIGHTS' }, { status: 400 })
    }

    return NextResponse.json({ error: lastError || 'Failed to send' }, { status: 400 })
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error)
    }, 'Error in superadmin send-telegram-message')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
