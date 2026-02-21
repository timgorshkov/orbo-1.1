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
// Email content — каждое письмо: заголовок + 3-4 строки + CTA-кнопка
// ---------------------------------------------------------------------------

function getEmailContent(ctx: UserContext, stepKey: string): { subject: string; html: string } {
  const greeting = ctx.name ? ctx.name.split(' ')[0] : 'Привет'

  switch (stepKey) {
    case 'connect_telegram':
      return {
        subject: 'Подключите Telegram — увидьте активность участников',
        html: emailLayout(greeting, `
          <p>Подключите Telegram, чтобы Orbo начал работать в полную силу:</p>
          <ul style="color:#4b5563; padding-left:20px;">
            <li>Уведомления о важных событиях в группах</li>
            <li>Аналитика активности в реальном времени</li>
            <li>Автоматический поиск участников по Telegram</li>
          </ul>
          ${ctaButton(`${APP_URL}/orgs`, 'Подключить Telegram')}
          <p style="font-size:13px; color:#9ca3af; margin-top:20px;">Это займёт 30 секунд.</p>
        `),
      }

    case 'workspace_ready':
      return {
        subject: 'Ваше пространство в Orbo готово',
        html: emailLayout(greeting, `
          <p>Ваш аккаунт в Orbo создан! Первые шаги:</p>
          <ol style="color:#4b5563; padding-left:20px;">
            <li><strong>Создайте пространство</strong> для вашего сообщества</li>
            <li><strong>Подключите Telegram-группу</strong> — участники появятся автоматически</li>
            <li><strong>Создайте событие</strong> — регистрация и напоминания включатся сами</li>
          </ol>
          ${ctaButton(`${APP_URL}/orgs`, 'Перейти в Orbo')}
        `),
      }

    case 'add_group':
      return {
        subject: 'Добавьте группу — Orbo начнёт собирать данные',
        html: emailLayout(greeting, `
          <p>Orbo становится по-настоящему полезным, когда подключена Telegram-группа.</p>
          <p><strong>Что произойдёт после подключения:</strong></p>
          <ul style="color:#4b5563; padding-left:20px;">
            <li>Участники автоматически появятся в карточках</li>
            <li>Включится аналитика активности и реакций</li>
            <li>Вы увидите, кто давно не писал и кто самый активный</li>
          </ul>
          ${ctaButton(`${APP_URL}/orgs`, 'Подключить группу')}
          <p style="font-size:13px; color:#9ca3af; margin-top:20px;">Занимает 2 минуты.</p>
        `),
      }

    case 'create_event':
      return {
        subject: 'Создайте событие — участники получат напоминания',
        html: emailLayout(greeting, `
          <p>Orbo помогает довести людей до мероприятия:</p>
          <ul style="color:#4b5563; padding-left:20px;">
            <li>Регистрация через miniapp в Telegram</li>
            <li>Автоматические напоминания за день и за час</li>
            <li>Отметка посещения и статистика доходимости</li>
          </ul>
          ${ctaButton(`${APP_URL}/orgs`, 'Создать событие')}
        `),
      }

    case 'video_overview':
      return {
        subject: 'Orbo за 3 минуты — всё, что нужно знать',
        html: emailLayout(greeting, `
          <p>Посмотрите короткий обзор Orbo — за 3 минуты покажем всё, что платформа умеет.</p>
          ${ctaButton(`${APP_URL}/orgs`, '🎬 Смотреть обзор')}
          <p style="font-size:13px; color:#9ca3af; margin-top:20px;">После просмотра вы точно найдёте что-то полезное для своего сообщества.</p>
        `),
      }

    case 'check_in':
      return {
        subject: 'Как Orbo? Нужна помощь?',
        html: emailLayout(greeting, `
          <p>Прошла неделя с регистрации. Как идут дела?</p>
          <p>Если что-то не получается или есть вопросы — ответьте на это письмо или напишите в Telegram.</p>
          ${ctaButton(`${APP_URL}/orgs`, 'Перейти в Orbo')}
          <p style="margin-top:10px; text-align:center;">
            <a href="https://t.me/orbo_assist_bot" style="color:#667eea; font-size:14px;">Написать в поддержку →</a>
          </p>
        `),
      }

    default:
      throw new Error(`Unknown email step: ${stepKey}`)
  }
}

// ---------------------------------------------------------------------------
// Telegram content — короткие сообщения с HTML-разметкой
// ---------------------------------------------------------------------------

function getTelegramContent(ctx: UserContext, stepKey: string): string {
  const name = ctx.name ? ctx.name.split(' ')[0] : ''
  const hi = name ? `${name}, ` : ''

  switch (stepKey) {
    case 'workspace_ready':
      return (
        `🏠 <b>${hi}ваш аккаунт в Orbo готов!</b>\n\n` +
        `Первые шаги:\n` +
        `1️⃣ Создайте пространство для сообщества\n` +
        `2️⃣ Подключите Telegram-группу\n` +
        `3️⃣ Участники появятся автоматически\n\n` +
        `👉 <a href="${APP_URL}/orgs">Перейти в Orbo</a>`
      )

    case 'add_group':
      return (
        `💡 <b>${hi}подключите Telegram-группу</b>\n\n` +
        `После подключения Orbo начнёт:\n` +
        `• Собирать карточки участников\n` +
        `• Считать активность и реакции\n` +
        `• Замечать тех, кто давно не писал\n\n` +
        `Подключение займёт 2 минуты 👉 <a href="${APP_URL}/orgs">Открыть Orbo</a>`
      )

    case 'create_event':
      return (
        `🎉 <b>${hi}создайте первое событие!</b>\n\n` +
        `С Orbo ваши участники:\n` +
        `• Регистрируются прямо в Telegram\n` +
        `• Получают напоминания автоматически\n` +
        `• Приходят чаще\n\n` +
        `Попробуйте → <a href="${APP_URL}/orgs">Создать событие</a>`
      )

    case 'video_overview':
      return (
        `🎬 <b>Orbo за 3 минуты</b>\n\n` +
        `Посмотрите короткий обзор — покажем, как платформа помогает управлять сообществом.\n\n` +
        `👉 <a href="${APP_URL}/orgs">Смотреть обзор</a>`
      )

    case 'check_in':
      return (
        `👋 <b>${hi}как Orbo?</b>\n\n` +
        `Прошла неделя с регистрации. Если есть вопросы — пишите прямо сюда или в @orbo_assist_bot.\n\n` +
        `Мы рады помочь!`
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
    <p style="margin: 4px 0;">Orbo — платформа для управления сообществами</p>
    <p style="margin: 4px 0;">
      <a href="${APP_URL}" style="color: #9ca3af;">my.orbo.ru</a>
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
