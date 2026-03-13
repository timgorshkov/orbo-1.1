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
import { createMaxService } from '@/lib/services/maxService'
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
  maxUserId: number | null
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

const MAX_CHAIN: ChainStep[] = [
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
  channel: 'email' | 'telegram' | 'max',
  options?: { restart?: boolean }
): Promise<void> {
  const supabase = createAdminServer()

  if (options?.restart) {
    await supabase
      .from('onboarding_messages')
      .delete()
      .eq('user_id', userId)
      .eq('channel', channel)
    logger.info({ user_id: userId, channel }, 'Cleared existing onboarding chain for restart')
  }

  const now = Date.now()
  const chain = channel === 'email' ? EMAIL_CHAIN : channel === 'max' ? MAX_CHAIN : TELEGRAM_CHAIN

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
// Error classification & retry config
// ---------------------------------------------------------------------------

const PERMANENT_TG_ERRORS = [
  'bot was blocked by the user',
  'user is deactivated',
  'chat not found',
  'have no rights to send a message',
  'bot was kicked',
  'need administrator rights',
  'bot is not a member',
]

const PERMANENT_EMAIL_ERRORS = [
  'no valid recipients',
  'invalid email',
  'email address is invalid',
  'user unknown',
  'mailbox not found',
  'does not exist',
  'address rejected',
  'unsubscribed',
  'blacklisted',
]

const TRANSIENT_ERROR_PATTERNS = [
  'fetch failed',
  'is not valid json',
  'unexpected token',
  'econnreset',
  'econnrefused',
  'etimedout',
  'socket hang up',
  'network',
  'abort',
  '502',
  '503',
  '504',
]

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 15 * 60 * 1000 // 15 minutes

async function cancelRemainingMessages(
  supabase: ReturnType<typeof createAdminServer>,
  userId: string,
  channel: string,
  reason: string,
): Promise<void> {
  const { data: remaining } = await supabase
    .from('onboarding_messages')
    .select('id')
    .eq('user_id', userId)
    .eq('channel', channel)
    .eq('status', 'pending')

  if (remaining && remaining.length > 0) {
    await supabase
      .from('onboarding_messages')
      .update({ status: 'skipped', error: `Auto-cancelled: ${reason}` })
      .eq('user_id', userId)
      .eq('channel', channel)
      .eq('status', 'pending')

    logger.info({ user_id: userId, channel, cancelled: remaining.length, reason }, 'Cancelled remaining onboarding messages')
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

  const now = new Date().toISOString()
  logger.info({ now }, 'processOnboardingMessages: querying pending messages')

  const { data: pending, error } = await supabase
    .from('onboarding_messages')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(20)

  if (error) {
    logger.error({ error: error.message, code: error.code }, 'processOnboardingMessages: DB query failed')
    return stats
  }

  if (!pending || pending.length === 0) {
    logger.info('processOnboardingMessages: no pending messages due')
    return stats
  }

  logger.info({ count: pending.length, ids: pending.map(m => m.id) }, 'processOnboardingMessages: found pending messages')

  // Group by user to avoid repeated context lookups
  const userIds = [...new Set(pending.map(m => m.user_id))]
  const contexts = new Map<string, UserContext>()

  for (const uid of userIds) {
    contexts.set(uid, await buildUserContext(uid))
  }

  for (const msg of pending) {
    stats.processed++
    const ctx = contexts.get(msg.user_id)!
    const chain = msg.channel === 'email' ? EMAIL_CHAIN : msg.channel === 'max' ? MAX_CHAIN : TELEGRAM_CHAIN
    const stepDef = chain.find(s => s.key === msg.step_key)

    logger.info({
      msg_id: msg.id, user_id: msg.user_id, channel: msg.channel,
      step: msg.step_key, scheduled_at: msg.scheduled_at,
    }, 'Processing onboarding message')

    if (stepDef?.skipIf?.(ctx)) {
      await supabase
        .from('onboarding_messages')
        .update({ status: 'skipped', sent_at: new Date().toISOString() })
        .eq('id', msg.id)
      stats.skipped++
      logger.info({ msg_id: msg.id, user_id: msg.user_id, step: msg.step_key }, 'Step skipped (condition already met)')

      // Shift subsequent pending messages: each takes the previous one's slot
      const { data: remaining } = await supabase
        .from('onboarding_messages')
        .select('id, scheduled_at')
        .eq('user_id', msg.user_id)
        .eq('channel', msg.channel)
        .eq('status', 'pending')
        .gt('scheduled_at', msg.scheduled_at)
        .order('scheduled_at', { ascending: true })

      if (remaining && remaining.length > 0) {
        let prevSlot = msg.scheduled_at
        for (const rem of remaining) {
          const currentSlot = rem.scheduled_at
          await supabase
            .from('onboarding_messages')
            .update({ scheduled_at: prevSlot })
            .eq('id', rem.id)
          prevSlot = currentSlot
        }
        logger.info({
          user_id: msg.user_id, channel: msg.channel, shifted: remaining.length,
        }, 'Shifted subsequent messages after skip')
      }

      continue
    }

    try {
      if (msg.channel === 'email') {
        await sendEmailStep(ctx, msg.step_key)
      } else if (msg.channel === 'max') {
        await sendMaxStep(ctx, msg.step_key)
      } else {
        await sendTelegramStep(ctx, msg.step_key)
        if (ctx.emailVerified && ctx.email && !ctx.email.endsWith('@telegram.user')) {
          await sendEmailStep(ctx, msg.step_key).catch((e) => {
            logger.warn({ user_id: msg.user_id, step: msg.step_key, error: String(e) }, 'Dual-channel email failed (non-critical)')
          })
        }
      }

      await supabase
        .from('onboarding_messages')
        .update({ status: 'sent', sent_at: new Date().toISOString(), error: null })
        .eq('id', msg.id)
      stats.sent++
      logger.info({ msg_id: msg.id, user_id: msg.user_id, step: msg.step_key, channel: msg.channel }, 'Message sent successfully')
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      const errLower = errMsg.toLowerCase()

      const isTgPermanent = PERMANENT_TG_ERRORS.some(p => errLower.includes(p))
      const isEmailPermanent = msg.channel === 'email' && PERMANENT_EMAIL_ERRORS.some(p => errLower.includes(p))
      const isPermanent = isTgPermanent || isEmailPermanent
      const isTransient = TRANSIENT_ERROR_PATTERNS.some(p => errLower.includes(p))

      if (isPermanent) {
        await supabase
          .from('onboarding_messages')
          .update({ status: 'failed', error: errMsg })
          .eq('id', msg.id)
        stats.failed++
        logger.warn({ msg_id: msg.id, user_id: msg.user_id, step: msg.step_key, channel: msg.channel, error: errMsg }, 'Permanent delivery error — cancelling remaining messages')

        await cancelRemainingMessages(supabase, msg.user_id, msg.channel, errMsg)
      } else if (isTransient) {
        const retryCount = (msg.retry_count || 0) + 1
        if (retryCount >= MAX_RETRIES) {
          await supabase
            .from('onboarding_messages')
            .update({ status: 'failed', error: `${errMsg} (after ${retryCount} retries)` })
            .eq('id', msg.id)
          stats.failed++
          logger.error({ msg_id: msg.id, user_id: msg.user_id, retries: retryCount, error: errMsg }, 'Transient error — max retries reached')
        } else {
          const retryAt = new Date(Date.now() + RETRY_DELAY_MS).toISOString()
          await supabase
            .from('onboarding_messages')
            .update({ scheduled_at: retryAt, error: `retry ${retryCount}: ${errMsg}`, retry_count: retryCount })
            .eq('id', msg.id)
          logger.info({ msg_id: msg.id, user_id: msg.user_id, retry: retryCount, retry_at: retryAt }, 'Transient error — scheduled retry')
        }
      } else {
        await supabase
          .from('onboarding_messages')
          .update({ status: 'failed', error: errMsg })
          .eq('id', msg.id)
        stats.failed++
        logger.error({ msg_id: msg.id, user_id: msg.user_id, step: msg.step_key, channel: msg.channel, error: errMsg }, 'Step send failed')
        // Cancel remaining chain steps to avoid repeated failures for the same user
        await cancelRemainingMessages(supabase, msg.user_id, msg.channel, `first step failed: ${errMsg}`)
      }
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
      userId, email: null, name: null, tgUserId: null, maxUserId: null,
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

  // Check MAX user ID (from user_telegram_accounts or future MAX accounts table)
  const maxUserId = (user as any).max_user_id || null

  return {
    userId,
    email: user.email,
    name: user.name,
    tgUserId,
    maxUserId,
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

// Domains used only for sending (no real inboxes) — skip outbound onboarding emails
const SENDER_ONLY_DOMAINS = ['orbo.ru'];

async function sendEmailStep(ctx: UserContext, stepKey: string): Promise<void> {
  if (!ctx.email) throw new Error('No email for user ' + ctx.userId)

  // Skip emails to internal/sender-only domains — they have no real mailboxes
  if (SENDER_ONLY_DOMAINS.some(d => ctx.email!.toLowerCase().endsWith('@' + d))) {
    logger.debug({ user_id: ctx.userId, email: ctx.email, step: stepKey }, 'Skipping onboarding email to internal domain')
    return
  }

  const { subject, html } = getEmailContent(ctx, stepKey)
  logger.info({ user_id: ctx.userId, email: ctx.email, step: stepKey, subject }, 'Sending onboarding email')
  const result = await sendEmail({ to: ctx.email, subject, html, tags: ['onboarding', stepKey] })
  if (!result.success) {
    // Caller classifies permanent vs transient and logs accordingly — avoid double error logging
    logger.warn({ user_id: ctx.userId, email: ctx.email, step: stepKey, error: result.error }, 'Email send failed')
    throw new Error(result.error || 'Email send failed')
  }
  logger.info({ user_id: ctx.userId, step: stepKey }, 'Onboarding email sent OK')
}

async function sendTelegramStep(ctx: UserContext, stepKey: string): Promise<void> {
  if (!ctx.tgUserId) throw new Error('No tg_user_id for user ' + ctx.userId)

  const text = getTelegramContent(ctx, stepKey)
  const tg = new TelegramService('registration')

  logger.info({ user_id: ctx.userId, tg_user_id: ctx.tgUserId, step: stepKey }, 'Sending onboarding TG message')
  const result = await tg.sendMessage(ctx.tgUserId, text, {
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  })

  if (!result.ok) {
    logger.error({ user_id: ctx.userId, tg_user_id: ctx.tgUserId, step: stepKey, error: result.description }, 'TG send failed')
    throw new Error(result.description || 'TG send failed')
  }
  logger.info({ user_id: ctx.userId, step: stepKey }, 'Onboarding TG message sent OK')
}

async function sendMaxStep(ctx: UserContext, stepKey: string): Promise<void> {
  if (!ctx.maxUserId) throw new Error('No max_user_id for user ' + ctx.userId)

  const text = getMaxContent(ctx, stepKey)

  let maxService
  try {
    maxService = createMaxService('notifications')
  } catch {
    maxService = createMaxService('main')
  }

  logger.info({ user_id: ctx.userId, max_user_id: ctx.maxUserId, step: stepKey }, 'Sending onboarding MAX message')
  const result = await maxService.sendMessageToUser(ctx.maxUserId, text, { format: 'html' })

  if (!result.ok) {
    logger.error({ user_id: ctx.userId, max_user_id: ctx.maxUserId, step: stepKey, error: result.error }, 'MAX send failed')
    throw new Error(typeof result.error === 'string' ? result.error : 'MAX send failed')
  }
  logger.info({ user_id: ctx.userId, step: stepKey }, 'Onboarding MAX message sent OK')
}

// ---------------------------------------------------------------------------
// MAX message content
// ---------------------------------------------------------------------------

function getMaxContent(ctx: UserContext, stepKey: string): string {
  const name = ctx.name ? ctx.name.split(' ')[0] : ''
  const hi = name ? `${name}, ` : ''
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://my.orbo.ru'

  switch (stepKey) {
    case 'workspace_ready':
      return (
        `🏠 <b>${hi}аккаунт создан!</b>\n\n` +
        `Чтобы увидеть Orbo в деле:\n` +
        `1. Подключите группу MAX — участники появятся в карточках\n` +
        `2. Создайте событие — участники смогут регистрироваться через MiniApp\n` +
        `3. Поделитесь ссылкой в группу — и получите первые регистрации\n\n` +
        `👉 ${APP_URL}/orgs`
      )
    case 'add_group':
      return (
        `💡 <b>${hi}пока нет группы, Orbo не видит участников</b>\n\n` +
        `Добавьте бота в группу MAX. После этого:\n` +
        `• Участники появятся в карточках с именами\n` +
        `• Заработает аналитика: кто пишет, кто молчит\n` +
        `• Можно будет создавать события с анонсами в группу\n\n` +
        `Занимает 2 минуты → ${APP_URL}/orgs`
      )
    case 'create_event':
      return (
        `🎉 <b>${hi}попробуйте создать событие</b>\n\n` +
        `MiniApp — участник регистрируется в один тап, не выходя из MAX.\n` +
        `Бот напомнит каждому в личку.\n` +
        `Вы видите: кто зарегистрировался, оплатил, пришёл.\n\n` +
        `Создайте событие → ${APP_URL}/orgs`
      )
    case 'video_overview':
      return (
        `✨ <b>${hi}попробуйте AI-анализ сообщества</b>\n\n` +
        `На дашборде есть кнопка «AI-анализ» — запустите для оценки здоровья сообщества.\n\n` +
        `У вас 5 бесплатных анализов → ${APP_URL}/orgs`
      )
    case 'check_in':
      return (
        `👋 <b>${hi}как дела с Orbo?</b>\n\n` +
        `Прошла неделя. Всё получилось? Если что-то непонятно — напишите нам.\n\n` +
        `Telegram основателя: @timgorshkov`
      )
    default:
      return `Orbo: ${stepKey}`
  }
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
            <li><strong>✨ AI-анализ участников</strong> — запустите на дашборде или в профиле участника: интересы, экспертиза, запросы. У вас 5 бесплатных анализов</li>
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
        `У вас 5 бесплатных анализов → <a href="${APP_URL}/orgs">Попробовать</a>`
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

// ---------------------------------------------------------------------------
// Template preview export (for superadmin)
// ---------------------------------------------------------------------------

const STEP_LABELS: Record<string, string> = {
  connect_telegram: 'Привяжите Telegram',
  workspace_ready: 'Аккаунт создан',
  add_group: 'Подключите группу',
  create_event: 'Создайте событие',
  video_overview: 'AI-анализ и возможности',
  check_in: 'Как дела?',
}

const SKIP_LABELS: Record<string, string> = {
  connect_telegram: 'Telegram уже привязан',
  add_group: 'Группа уже подключена',
  create_event: 'Событие уже создано',
}

export interface TemplatePreview {
  stepKey: string
  label: string
  channel: 'email' | 'telegram'
  stepNumber: number
  delayLabel: string
  subject?: string
  bodyHtml?: string
  bodyText?: string
  skipCondition?: string
}

export function getAllTemplatesForPreview(): TemplatePreview[] {
  const sampleCtx: UserContext = {
    userId: 'preview',
    email: 'user@example.com',
    name: 'Тим',
    tgUserId: 154588486,
    maxUserId: null,
    hasOrg: true,
    hasTelegramLinked: false,
    hasGroup: false,
    hasEvent: false,
    emailVerified: true,
  }

  const delayMap: Record<number, string> = {
    [1 * HOUR]: '+1 час',
    [1 * DAY]: '+1 день',
    [3 * DAY]: '+3 дня',
    [5 * DAY]: '+5 дней',
    [7 * DAY]: '+7 дней',
  }

  const templates: TemplatePreview[] = []

  EMAIL_CHAIN.forEach((step, i) => {
    const content = getEmailContent(sampleCtx, step.key)
    templates.push({
      stepKey: step.key,
      label: STEP_LABELS[step.key] || step.key,
      channel: 'email',
      stepNumber: i + 1,
      delayLabel: delayMap[step.delayMs] || `+${Math.round(step.delayMs / HOUR)}ч`,
      subject: content.subject,
      bodyHtml: content.html,
      skipCondition: SKIP_LABELS[step.key],
    })
  })

  TELEGRAM_CHAIN.forEach((step, i) => {
    const content = getTelegramContent(sampleCtx, step.key)
    templates.push({
      stepKey: step.key,
      label: STEP_LABELS[step.key] || step.key,
      channel: 'telegram',
      stepNumber: i + 1,
      delayLabel: delayMap[step.delayMs] || `+${Math.round(step.delayMs / HOUR)}ч`,
      bodyText: content,
      skipCondition: SKIP_LABELS[step.key],
    })
  })

  return templates
}
