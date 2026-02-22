/**
 * Onboarding Communication Chains
 *
 * Two parallel chains:
 *   1. Email chain — for users who registered via email/OAuth
 *   2. Telegram chain — for users who registered via TG MiniApp
 *
 * Each chain has 5 timed steps with skip logic:
 *   +1h   connect_telegram / workspace_ready
 *   +1d   add_group
 *   +3d   create_event
 *   +5d   video_overview
 *   +7d   check_in
 */

import { createAdminServer } from '@/lib/server/supabaseServer'
import { sendEmail } from '@/lib/services/email'
import { TelegramService } from '@/lib/services/telegramService'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('OnboardingChain')

// ---------------------------------------------------------------------------
// Chain definitions
// ---------------------------------------------------------------------------

interface ChainStep {
  key: string
  delayMs: number
  skipIf?: (ctx: UserContext) => boolean
}

interface UserContext {
  userId: string
  email: string | null
  name: string | null
  tgUserId: number | null
  hasOrg: boolean
  hasTelegramLinked: boolean
  hasGroup: boolean
  hasEvent: boolean
  emailVerified: boolean
}

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

const EMAIL_CHAIN: ChainStep[] = [
  { key: 'connect_telegram', delayMs: 1 * HOUR, skipIf: ctx => ctx.hasTelegramLinked },
  { key: 'add_group',        delayMs: 1 * DAY,  skipIf: ctx => ctx.hasGroup },
  { key: 'create_event',     delayMs: 3 * DAY,  skipIf: ctx => ctx.hasEvent },
  { key: 'video_overview',   delayMs: 5 * DAY },
  { key: 'check_in',         delayMs: 7 * DAY },
]

const TELEGRAM_CHAIN: ChainStep[] = [
  { key: 'workspace_ready',  delayMs: 1 * HOUR },
  { key: 'add_group',        delayMs: 1 * DAY,  skipIf: ctx => ctx.hasGroup },
  { key: 'create_event',     delayMs: 3 * DAY,  skipIf: ctx => ctx.hasEvent },
  { key: 'video_overview',   delayMs: 5 * DAY },
  { key: 'check_in',         delayMs: 7 * DAY },
]

// ---------------------------------------------------------------------------
// Schedule chain for a new user
// ---------------------------------------------------------------------------

export async function scheduleOnboardingChain(
  userId: string,
  channel: 'email' | 'telegram'
): Promise<void> {
  const supabase = createAdminServer()
  const now = Date.now()
  const chain = channel === 'email' ? EMAIL_CHAIN : TELEGRAM_CHAIN

  const rows = chain.map(step => ({
    user_id: userId,
    step_key: step.key,
    channel,
    status: 'pending',
    scheduled_at: new Date(now + step.delayMs).toISOString(),
  }))

  const { error } = await supabase
    .from('onboarding_messages')
    .upsert(rows, { onConflict: 'user_id,step_key,channel', ignoreDuplicates: true })

  if (error) {
    logger.error({ user_id: userId, channel, error: error.message }, 'Failed to schedule chain')
  } else {
    logger.info({ user_id: userId, channel, steps: rows.length }, 'Onboarding chain scheduled')
  }
}

// ---------------------------------------------------------------------------
// Process pending messages (called by cron)
// ---------------------------------------------------------------------------

export async function processOnboardingMessages(): Promise<{
  processed: number
  sent: number
  skipped: number
  failed: number
}> {
  const supabase = createAdminServer()
  const stats = { processed: 0, sent: 0, skipped: 0, failed: 0 }

  const { data: pending, error } = await supabase
    .from('onboarding_messages')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(20)

  if (error || !pending || pending.length === 0) {
    return stats
  }

  // Group by user to avoid repeated context lookups
  const userIds = [...new Set(pending.map(m => m.user_id))]
  const contexts = new Map<string, UserContext>()

  for (const uid of userIds) {
    contexts.set(uid, await buildUserContext(uid))
  }

  for (const msg of pending) {
    stats.processed++
    const ctx = contexts.get(msg.user_id)!
    const chain = msg.channel === 'email' ? EMAIL_CHAIN : TELEGRAM_CHAIN
    const stepDef = chain.find(s => s.key === msg.step_key)

    // Check skip logic
    if (stepDef?.skipIf?.(ctx)) {
      await supabase
        .from('onboarding_messages')
        .update({ status: 'skipped', sent_at: new Date().toISOString() })
        .eq('id', msg.id)
      stats.skipped++
      logger.debug({ user_id: msg.user_id, step: msg.step_key }, 'Step skipped (condition met)')
      continue
    }

    try {
      if (msg.channel === 'email') {
        await sendEmailStep(ctx, msg.step_key)
      } else {
        await sendTelegramStep(ctx, msg.step_key)
        // Also send email if user has a verified email (dual-channel for TG users)
        if (ctx.emailVerified && ctx.email && !ctx.email.endsWith('@telegram.user')) {
          await sendEmailStep(ctx, msg.step_key).catch(() => {})
        }
      }

      await supabase
        .from('onboarding_messages')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', msg.id)
      stats.sent++
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      await supabase
        .from('onboarding_messages')
        .update({ status: 'failed', error: errMsg })
        .eq('id', msg.id)
      stats.failed++
      logger.error({ user_id: msg.user_id, step: msg.step_key, error: errMsg }, 'Step send failed')
    }
  }

  return stats
}

// ---------------------------------------------------------------------------
// Build context for skip-logic decisions
// ---------------------------------------------------------------------------

async function buildUserContext(userId: string): Promise<UserContext> {
  const supabase = createAdminServer()

  const { data: user } = await supabase
    .from('users')
    .select('id, email, name, email_verified, tg_user_id')
    .eq('id', userId)
    .single()

  if (!user) {
    return {
      userId, email: null, name: null, tgUserId: null,
      hasOrg: false, hasTelegramLinked: false, hasGroup: false,
      hasEvent: false, emailVerified: false,
    }
  }

  // Check org
  const { data: membership } = await supabase
    .from('memberships')
    .select('org_id')
    .eq('user_id', userId)
    .eq('role', 'owner')
    .limit(1)
    .maybeSingle()

  const orgId = membership?.org_id

  // Check TG linked
  const { data: tgAccount } = await supabase
    .from('accounts')
    .select('provider_account_id')
    .eq('user_id', userId)
    .eq('provider', 'telegram')
    .maybeSingle()

  const tgUserId = tgAccount
    ? parseInt(tgAccount.provider_account_id, 10)
    : user.tg_user_id || null

  // Check connected groups
  let hasGroup = false
  if (orgId) {
    const { count } = await supabase
      .from('org_telegram_groups')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
    hasGroup = (count || 0) > 0
  }

  // Check events
  let hasEvent = false
  if (orgId) {
    const { count } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
    hasEvent = (count || 0) > 0
  }

  return {
    userId,
    email: user.email,
    name: user.name,
    tgUserId,
    hasOrg: !!orgId,
    hasTelegramLinked: !!tgAccount,
    hasGroup,
    hasEvent,
    emailVerified: !!user.email_verified,
  }
}

// ---------------------------------------------------------------------------
// Send individual steps
// ---------------------------------------------------------------------------

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru'

async function sendEmailStep(ctx: UserContext, stepKey: string): Promise<void> {
  if (!ctx.email) throw new Error('No email')
  const { subject, html } = getEmailContent(ctx, stepKey)
  const result = await sendEmail({ to: ctx.email, subject, html, tags: ['onboarding', stepKey] })
  if (!result.success) throw new Error(result.error || 'Email send failed')
}

async function sendTelegramStep(ctx: UserContext, stepKey: string): Promise<void> {
  if (!ctx.tgUserId) throw new Error('No tg_user_id')

  const text = getTelegramContent(ctx, stepKey)
  const tg = new TelegramService('registration')

  const result = await tg.sendMessage(ctx.tgUserId, text, {
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  })

  if (!result.ok) throw new Error(result.description || 'TG send failed')
}

// ---------------------------------------------------------------------------
// Email content — конкретная польза + CTA на нужное действие
// ---------------------------------------------------------------------------

function getEmailContent(ctx: UserContext, stepKey: string): { subject: string; html: string } {
  const greeting = ctx.name ? ctx.name.split(' ')[0] : 'Привет'

  switch (stepKey) {
    case 'connect_telegram':
      return {
        subject: 'Подключите Telegram — увидьте, кто в вашем сообществе',
        html: emailLayout(greeting, `
          <p>Привяжите Telegram-аккаунт, чтобы Orbo заработал в полную силу:</p>
          <ul style="color:#4b5563; padding-left:20px;">
            <li>Добавите бота в группу — участники начнут появляться в карточках</li>
            <li>Будете получать уведомления о важных событиях в группе</li>
            <li>Сможете отправлять анонсы и напоминания от имени бота</li>
          </ul>
          ${ctaButton(`${APP_URL}/settings`, 'Привязать Telegram')}
          <p style="font-size:13px; color:#9ca3af; margin-top:20px;">Это займёт 30 секунд.</p>
        `),
      }

    case 'workspace_ready':
      return {
        subject: 'Ваше пространство в Orbo готово — 3 шага до первого события',
        html: emailLayout(greeting, `
          <p>Аккаунт создан! Вот что стоит сделать первым:</p>
          <ol style="color:#4b5563; padding-left:20px;">
            <li><strong>Подключите Telegram-группу</strong> — добавьте бота, и участники начнут появляться в карточках</li>
            <li><strong>Создайте событие</strong> — MiniApp для регистрации прямо в Telegram, напоминания за 24ч и 1ч</li>
            <li><strong>Поделитесь ссылкой</strong> — киньте в группу и получите первые регистрации</li>
          </ol>
          ${ctaButton(`${APP_URL}/orgs`, 'Перейти в Orbo')}
        `),
      }

    case 'add_group':
      return {
        subject: 'Добавьте группу — участники появятся в карточках',
        html: emailLayout(greeting, `
          <p>Пока группа не подключена, Orbo не видит ваших участников.</p>
          <p><strong>Что произойдёт после подключения:</strong></p>
          <ul style="color:#4b5563; padding-left:20px;">
            <li>Участники автоматически появятся в карточках с именами и username</li>
            <li>Заработает аналитика: кто пишет, кто молчит, кто ушёл</li>
            <li>Можно будет создавать события с анонсами прямо в группу</li>
          </ul>
          ${ctaButton(`${APP_URL}/orgs`, 'Подключить группу')}
          <p style="font-size:13px; color:#9ca3af; margin-top:20px;">Добавьте бота в группу как администратора — занимает 2 минуты.</p>
        `),
      }

    case 'create_event':
      return {
        subject: 'Создайте событие — люди регистрируются прямо в Telegram',
        html: emailLayout(greeting, `
          <p>Мероприятие — лучший способ проверить Orbo в деле:</p>
          <ul style="color:#4b5563; padding-left:20px;">
            <li><strong>MiniApp</strong> — участник регистрируется в один тап, не покидая Telegram</li>
            <li><strong>Напоминания</strong> — бот пишет в личку за 24ч и за 1ч до события</li>
            <li><strong>Учёт</strong> — кто зарегистрировался, оплатил, пришёл</li>
          </ul>
          <p>Создайте событие, поделитесь ссылкой в группу — и посмотрите, как это работает.</p>
          ${ctaButton(`${APP_URL}/orgs`, 'Создать событие')}
        `),
      }

    case 'video_overview':
      return {
        subject: 'Что ещё умеет Orbo — AI-анализ и не только',
        html: emailLayout(greeting, `
          <p>Помимо событий и участников, в Orbo есть:</p>
          <ul style="color:#4b5563; padding-left:20px;">
            <li><strong>✨ AI-анализ сообщества</strong> — запустите на дашборде и получите оценку здоровья, находки и рекомендации. У вас есть 3 бесплатных анализа</li>
            <li><strong>Заявки на вступление</strong> — анкета через MiniApp, spam-score, воронка со статусами</li>
            <li><strong>Анонсы</strong> — бот автоматически публикует в группы по расписанию</li>
            <li><strong>Импорт истории</strong> — загрузите историю чата, чтобы сразу увидеть активных участников</li>
          </ul>
          ${ctaButton(`${APP_URL}/orgs`, 'Попробовать AI-анализ')}
        `),
      }

    case 'check_in':
      return {
        subject: 'Как дела с Orbo? Нужна помощь?',
        html: emailLayout(greeting, `
          <p>Прошла неделя с регистрации. Хотел уточнить — всё ли получилось?</p>
          <p>Если что-то не работает или непонятно — просто ответьте на это письмо. Я читаю все ответы лично.</p>
          <p>Или напишите в Telegram — обычно отвечаем в течение часа.</p>
          ${ctaButton(`${APP_URL}/orgs`, 'Открыть Orbo')}
          <p style="margin-top:10px; text-align:center;">
            <a href="https://t.me/timgorshkov" style="color:#667eea; font-size:14px;">Написать основателю в Telegram →</a>
          </p>
        `),
      }

    default:
      throw new Error(`Unknown email step: ${stepKey}`)
  }
}

// ---------------------------------------------------------------------------
// Telegram content — короткие сообщения, конкретные действия
// ---------------------------------------------------------------------------

function getTelegramContent(ctx: UserContext, stepKey: string): string {
  const name = ctx.name ? ctx.name.split(' ')[0] : ''
  const hi = name ? `${name}, ` : ''

  switch (stepKey) {
    case 'workspace_ready':
      return (
        `🏠 <b>${hi}аккаунт создан!</b>\n\n` +
        `Чтобы увидеть Orbo в деле:\n` +
        `1. Подключите Telegram-группу — участники появятся в карточках\n` +
        `2. Создайте событие — участники смогут регистрироваться через MiniApp\n` +
        `3. Поделитесь ссылкой в группу — и получите первые регистрации\n\n` +
        `👉 <a href="${APP_URL}/orgs">Перейти в Orbo</a>`
      )

    case 'add_group':
      return (
        `💡 <b>${hi}пока нет группы, Orbo не видит участников</b>\n\n` +
        `Добавьте бота в Telegram-группу как администратора. После этого:\n` +
        `• Участники появятся в карточках с именами\n` +
        `• Заработает аналитика: кто пишет, кто молчит\n` +
        `• Можно будет создавать события с анонсами в группу\n\n` +
        `Занимает 2 минуты → <a href="${APP_URL}/orgs">Подключить группу</a>`
      )

    case 'create_event':
      return (
        `🎉 <b>${hi}попробуйте создать событие</b>\n\n` +
        `Это лучший способ увидеть Orbo в деле:\n` +
        `• MiniApp — участник регистрируется в один тап, не выходя из Telegram\n` +
        `• Бот напомнит каждому в личку за 24ч и за 1ч\n` +
        `• Вы видите: кто зарегистрировался, оплатил, пришёл\n\n` +
        `Создайте, киньте ссылку в группу → <a href="${APP_URL}/orgs">Создать событие</a>`
      )

    case 'video_overview':
      return (
        `✨ <b>${hi}попробуйте AI-анализ сообщества</b>\n\n` +
        `На дашборде есть кнопка «AI-анализ» — запустите, и получите:\n` +
        `• Оценку здоровья сообщества\n` +
        `• Конкретные находки по данным\n` +
        `• Рекомендации на ближайшую неделю\n\n` +
        `У вас 3 бесплатных анализа → <a href="${APP_URL}/orgs">Попробовать</a>`
      )

    case 'check_in':
      return (
        `👋 <b>${hi}как дела с Orbo?</b>\n\n` +
        `Прошла неделя. Всё получилось? Если что-то непонятно или не работает — напишите мне прямо сюда. Отвечу лично.\n\n` +
        `Telegram основателя: @timgorshkov`
      )

    default:
      throw new Error(`Unknown TG step: ${stepKey}`)
  }
}

// ---------------------------------------------------------------------------
// HTML email helpers
// ---------------------------------------------------------------------------

function emailLayout(greeting: string, body: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 24px 30px; text-align: center; border-radius: 12px 12px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">Orbo</h1>
  </div>
  <div style="background: #ffffff; padding: 32px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
    <p style="font-size: 16px; margin-top: 0;">${greeting}!</p>
    ${body}
  </div>
  <div style="text-align: center; margin-top: 24px; padding: 16px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 4px 0;">Orbo — CRM участников и событий для Telegram-сообществ</p>
    <p style="margin: 4px 0;">
      <a href="https://orbo.ru" style="color: #9ca3af;">orbo.ru</a> · <a href="${APP_URL}" style="color: #9ca3af;">my.orbo.ru</a>
    </p>
  </div>
</body>
</html>`.trim()
}

function ctaButton(href: string, text: string): string {
  return `
  <div style="text-align: center; margin: 24px 0;">
    <a href="${href}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 36px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
      ${text}
    </a>
  </div>`
}
