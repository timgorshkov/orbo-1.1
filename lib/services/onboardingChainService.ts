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

// Thrown when a step should be silently skipped (data condition, not delivery failure)
class StepSkipError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'StepSkipError'
  }
}

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
  hasImport: boolean
  hasEvent: boolean
  emailVerified: boolean
}

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

const EMAIL_CHAIN: ChainStep[] = [
  { key: 'connect_telegram',    delayMs: 30 * 60 * 1000,  skipIf: ctx => ctx.hasTelegramLinked },
  { key: 'add_group',           delayMs: 4 * HOUR,         skipIf: ctx => ctx.hasGroup },
  // Импорт: отправляется тем, кто подключил группу, но ещё не загружал историю
  { key: 'import_history',      delayMs: 1 * DAY,          skipIf: ctx => !ctx.hasGroup || ctx.hasImport },
  { key: 'create_event',        delayMs: 2 * DAY,          skipIf: ctx => ctx.hasEvent },
  { key: 'video_overview',      delayMs: 4 * DAY },
  // Реактивация: отправляется только тем, у кого нет орга или уже всё настроено
  { key: 'reactivation_connect', delayMs: 10 * DAY,        skipIf: ctx => !ctx.hasOrg || (ctx.hasTelegramLinked && ctx.hasGroup) },
  { key: 'check_in',            delayMs: 14 * DAY },
]

const TELEGRAM_CHAIN: ChainStep[] = [
  { key: 'workspace_ready',  delayMs: 5 * 60 * 1000 },
  // Все последующие шаги отправляются только пользователям, создавшим организацию.
  // Без этого условия цепочка продолжается даже для тех, кто зарегистрировался
  // из любопытства и ушёл — они блокируют бота, теряя возможность получать
  // важные уведомления в будущем. workspace_ready отправляется всем как приветствие.
  { key: 'add_group',           delayMs: 4 * HOUR,         skipIf: ctx => !ctx.hasOrg || ctx.hasGroup },
  // Импорт: только тем, кто подключил группу, но ещё не загружал историю
  { key: 'import_history',      delayMs: 1 * DAY,          skipIf: ctx => !ctx.hasOrg || !ctx.hasGroup || ctx.hasImport },
  { key: 'create_event',        delayMs: 2 * DAY,          skipIf: ctx => !ctx.hasOrg || ctx.hasEvent },
  { key: 'video_overview',      delayMs: 4 * DAY,          skipIf: ctx => !ctx.hasOrg },
  // Реактивация: только тем, у кого есть орг, но нет подключённой группы
  { key: 'reactivation_connect', delayMs: 10 * DAY,        skipIf: ctx => !ctx.hasOrg || ctx.hasGroup },
  { key: 'check_in',            delayMs: 14 * DAY,         skipIf: ctx => !ctx.hasOrg },
]

const MAX_CHAIN: ChainStep[] = [
  { key: 'workspace_ready',  delayMs: 5 * 60 * 1000 },
  // Аналогично TELEGRAM_CHAIN: советы только тем, кто создал организацию.
  { key: 'add_group',           delayMs: 4 * HOUR,         skipIf: ctx => !ctx.hasOrg || ctx.hasGroup },
  // Импорт: только тем, кто подключил группу, но ещё не загружал историю
  { key: 'import_history',      delayMs: 1 * DAY,          skipIf: ctx => !ctx.hasOrg || !ctx.hasGroup || ctx.hasImport },
  { key: 'create_event',        delayMs: 2 * DAY,          skipIf: ctx => !ctx.hasOrg || ctx.hasEvent },
  { key: 'video_overview',      delayMs: 4 * DAY,          skipIf: ctx => !ctx.hasOrg },
  { key: 'reactivation_connect', delayMs: 10 * DAY,        skipIf: ctx => !ctx.hasOrg || ctx.hasGroup },
  { key: 'check_in',            delayMs: 14 * DAY,         skipIf: ctx => !ctx.hasOrg },
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

const MAX_RETRIES = 8
const RETRY_DELAY_MS = 20 * 60 * 1000 // 20 minutes (8 retries × 20min = ~2.5h window)

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
      // StepSkipError: data condition (no email, internal domain) — mark skipped, not failed
      if (err instanceof StepSkipError) {
        await supabase
          .from('onboarding_messages')
          .update({ status: 'skipped', sent_at: new Date().toISOString(), error: err.message })
          .eq('id', msg.id)
        stats.skipped++
        logger.debug({ msg_id: msg.id, user_id: msg.user_id, step: msg.step_key, reason: err.message }, 'Step silently skipped (data condition)')
        continue
      }

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
          const { error: retryUpdateErr } = await supabase
            .from('onboarding_messages')
            .update({ scheduled_at: retryAt, error: `retry ${retryCount}: ${errMsg}`, retry_count: retryCount })
            .eq('id', msg.id)
          if (retryUpdateErr) {
            logger.warn({ msg_id: msg.id, error: retryUpdateErr.message }, 'Failed to schedule retry — message stays pending')
          } else {
            logger.warn({ msg_id: msg.id, user_id: msg.user_id, step: msg.step_key, channel: msg.channel, retry: retryCount, retry_at: retryAt, error: errMsg }, 'Transient error — scheduled retry')
          }
        }
      } else {
        // Unknown error — treat as transient to avoid killing the chain on unexpected provider errors
        const retryCount = (msg.retry_count || 0) + 1
        if (retryCount >= MAX_RETRIES) {
          await supabase
            .from('onboarding_messages')
            .update({ status: 'failed', error: `${errMsg} (after ${retryCount} retries)` })
            .eq('id', msg.id)
          stats.failed++
          logger.error({ msg_id: msg.id, user_id: msg.user_id, step: msg.step_key, channel: msg.channel, retries: retryCount, error: errMsg }, 'Unknown error — max retries reached, marking failed')
        } else {
          const retryAt = new Date(Date.now() + RETRY_DELAY_MS).toISOString()
          await supabase
            .from('onboarding_messages')
            .update({ scheduled_at: retryAt, error: `retry ${retryCount} (unknown): ${errMsg}`, retry_count: retryCount })
            .eq('id', msg.id)
          logger.warn({ msg_id: msg.id, user_id: msg.user_id, step: msg.step_key, channel: msg.channel, retry: retryCount, retry_at: retryAt, error: errMsg }, 'Unknown error — scheduled retry (not classified as permanent)')
        }
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
      hasOrg: false, hasTelegramLinked: false, hasGroup: false, hasImport: false,
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

  // Check completed history imports
  let hasImport = false
  if (orgId) {
    const { count } = await supabase
      .from('telegram_import_batches')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'completed')
    hasImport = (count || 0) > 0
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
    hasTelegramLinked: !!(tgAccount || user.tg_user_id),
    hasGroup,
    hasImport,
    hasEvent,
    emailVerified: !!user.email_verified,
  }
}

// ---------------------------------------------------------------------------
// Send individual steps
// ---------------------------------------------------------------------------

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru'

// Domains used only for sending (no real inboxes) — skip outbound onboarding emails
const SENDER_ONLY_DOMAINS = ['orbo.ru', 'orbo.temp'];

async function sendEmailStep(ctx: UserContext, stepKey: string): Promise<void> {
  if (!ctx.email) {
    throw new StepSkipError('No email address for user ' + ctx.userId)
  }

  // Skip emails to internal/sender-only domains — they have no real mailboxes
  if (SENDER_ONLY_DOMAINS.some(d => ctx.email!.toLowerCase().endsWith('@' + d))) {
    throw new StepSkipError('Internal domain, no real mailbox: ' + ctx.email)
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://my.orbo.ru'

  switch (stepKey) {
    case 'workspace_ready':
      return (
        `${hi}аккаунт создан!\n\n` +
        `Три шага до первого результата:\n\n` +
        `1. Подключите группу MAX — участники появятся в карточках\n` +
        `2. Создайте событие — MiniApp для регистрации + автонапоминания\n` +
        `3. Поделитесь ссылкой в группу\n\n` +
        `→ ${appUrl}/orgs`
      )
    case 'add_group':
      return (
        `${hi}пока нет группы — Orbo не видит участников\n\n` +
        `Добавьте бота в группу MAX как администратора:\n` +
        `• Участники появятся с именами и активностью\n` +
        `• Запустится аналитика\n` +
        `• Контакты сохранятся надёжно\n\n` +
        `2 минуты → ${appUrl}/orgs`
      )
    case 'import_history':
      return (
        `${hi}группа подключена — но бот видит только тех, кто написал после подключения\n\n` +
        `Чтобы восстановить всю базу:\n\n` +
        `1. Откройте группу в Telegram Desktop\n` +
        `2. Нажмите ⋯ → Экспорт истории чата → формат JSON\n` +
        `3. Загрузите файл в Orbo → Telegram → группа → Импорт истории\n\n` +
        `Orbo автоматически распознает всех участников и создаст профили.\n\n` +
        `→ ${appUrl}/orgs`
      )
    case 'create_event':
      return (
        `${hi}попробуйте создать событие\n\n` +
        `MiniApp — регистрация в один тап, без перехода на сайт.\n` +
        `Бот напомнит каждому в личку.\n` +
        `Видно: кто зарегистрировался, оплатил, пришёл.\n\n` +
        `→ ${appUrl}/orgs`
      )
    case 'video_overview':
      return (
        `${hi}мы сделали короткое демо 🎬\n\n` +
        `6 минут — посмотрите, как организаторы используют Orbo:\n` +
        `• База участников с историей активности\n` +
        `• MiniApp для мероприятий и регистраций\n` +
        `• Заявки на вступление и воронка\n\n` +
        `→ https://orbo.ru/demo`
      )
    case 'reactivation_connect':
      return (
        `Привет! Это не очередное напоминание из рассылки.\n\n` +
        `Мы заметили, что группа так и не подключена к Orbo. Без этого бот не видит ваших участников.\n\n` +
        `Как исправить за 2 минуты:\n` +
        `1. Добавьте бота в группу MAX как администратора\n` +
        `2. Откройте настройки Orbo → Telegram → Доступные группы\n` +
        `3. Выберите группу — готово\n\n` +
        `→ ${process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru'}/orgs\n\n` +
        `Если нужна помощь — напишите: @timgorshkov`
      )
    case 'check_in':
      return (
        `${hi}как дела с Orbo?\n\n` +
        `Прошла неделя. Получилось настроить? Если что-то непонятно — напишите, отвечу лично.\n\n` +
        `@timgorshkov — основатель`
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
        subject: 'Подключите Telegram — сохраните базу участников',
        html: emailLayout(greeting, `
          <p style="font-size:15px; color:#334155; line-height:1.6; margin:0 0 20px;">
            Без привязки Telegram Orbo не сможет работать с вашей группой. Подключение занимает 30 секунд.
          </p>
          ${featureRow('👥', 'База участников', 'Бот соберёт профили всех, кто пишет в группе — имена, username, активность')}
          ${featureRow('🔒', 'Сохранность контактов', 'Даже если Telegram станет недоступен — контакты и история останутся у вас')}
          ${featureRow('📊', 'AI-анализ', '5 бесплатных AI-анализов профилей — интересы, экспертиза, запросы участников')}
          ${ctaButton(`${APP_URL}/welcome`, 'Подключить Telegram')}
          ${hint('Нажмите → откроется страница настройки → нажмите кнопку «Подключить Telegram» → откроется бот → нажмите Start')}
        `, { preheader: 'Без Telegram Orbo не увидит участников вашей группы' }),
      }

    case 'workspace_ready':
      return {
        subject: 'Пространство готово — 3 шага до результата',
        html: emailLayout(greeting, `
          <p style="font-size:15px; color:#334155; line-height:1.6; margin:0 0 20px;">
            Аккаунт создан. Вот как получить первые результаты за 5 минут:
          </p>
          ${stepRow('1', '<b>Подключите группу</b> — добавьте бота, и участники начнут появляться в карточках с именами и профилями')}
          ${stepRow('2', '<b>Создайте событие</b> — MiniApp для регистрации прямо в Telegram. Бот напомнит каждому в личку')}
          ${stepRow('3', '<b>Поделитесь ссылкой</b> — отправьте в группу и получите первые регистрации')}
          ${ctaButton(`${APP_URL}/orgs`, 'Начать настройку')}
          ${divider()}
          <p style="font-size:13px; color:#64748b; line-height:1.5; margin:0; text-align:center;">
            Бесплатно до 500 участников. Данные хранятся на серверах в России.
          </p>
        `, { preheader: 'Подключите группу → создайте событие → получите первые регистрации' }),
      }

    case 'add_group':
      return {
        subject: 'Без группы Orbo не видит участников',
        html: emailLayout(greeting, `
          <p style="font-size:15px; color:#334155; line-height:1.6; margin:0 0 6px;">
            Вы создали пространство, но группа ещё не подключена.
          </p>
          <p style="font-size:15px; color:#334155; line-height:1.6; margin:0 0 20px;">
            Пока бот не в группе — карточки участников пустые, аналитика не работает.
          </p>
          <p style="font-size:14px; font-weight:600; color:#1e1b4b; margin:0 0 12px;">Что изменится после подключения:</p>
          ${featureRow('👤', 'Карточки участников', 'Имена, username, дата вступления, число сообщений — по каждому участнику')}
          ${featureRow('📈', 'Аналитика активности', 'Кто пишет, кто молчит, кто ушёл. Без ручного подсчёта')}
          ${featureRow('📢', 'Анонсы в группу', 'Бот автоматически опубликует анонс мероприятия в нужное время')}
          ${ctaButton(`${APP_URL}/orgs`, 'Подключить группу')}
          ${hint('Добавьте бота в группу как администратора — 2 минуты')}
        `, { preheader: 'Подключите группу — участники появятся в карточках автоматически' }),
      }

    case 'import_history':
      return {
        subject: 'Группа подключена. Загрузите историю — увидите всю базу',
        html: emailLayout(greeting, `
          <p style="font-size:15px; color:#334155; line-height:1.6; margin:0 0 8px;">
            Группа подключена, но сейчас Orbo видит только тех, кто написал <strong>после</strong> подключения бота — обычно это 5–30 человек.
          </p>
          <p style="font-size:15px; color:#334155; line-height:1.6; margin:0 0 20px;">
            Чтобы восстановить <strong>всю историческую базу</strong> — загрузите экспорт переписки из Telegram Desktop.
          </p>
          <p style="font-size:14px; font-weight:600; color:#1e1b4b; margin:0 0 12px;">Как это сделать:</p>
          ${stepRow('1', 'Откройте группу в <b>Telegram Desktop</b> (не в мобильном приложении)')}
          ${stepRow('2', 'Нажмите <b>⋯ → Экспорт истории чата</b>')}
          ${stepRow('3', 'Выберите формат <b>JSON</b>, снимите галочки с медиа — файл будет меньше')}
          ${stepRow('4', 'Загрузите файл в <b>Orbo → Telegram → группа → Импорт истории</b>')}
          ${ctaButton(`${APP_URL}/orgs`, 'Загрузить историю')}
          ${divider()}
          <p style="font-size:13px; color:#64748b; line-height:1.5; margin:0; text-align:center;">
            Orbo автоматически распознает участников по Telegram ID — точно, без дубликатов.
          </p>
        `, { preheader: 'Бот видит только последние 5–30 человек. Загрузите историю — увидите всех' }),
      }

    case 'create_event':
      return {
        subject: 'Создайте событие — увидите Orbo в деле',
        html: emailLayout(greeting, `
          <p style="font-size:15px; color:#334155; line-height:1.6; margin:0 0 20px;">
            Мероприятие — самый быстрый способ проверить, как Orbo работает с вашей аудиторией.
          </p>
          ${featureRow('⚡', 'MiniApp-регистрация', 'Участник регистрируется в один тап прямо в Telegram — без перехода на внешний сайт')}
          ${featureRow('🔔', 'Автоматические напоминания', 'Бот пишет в личку за 24ч и за 1ч. Организатору больше не нужно писать каждому')}
          ${featureRow('💰', 'Учёт оплат', 'Видно, кто зарегистрировался, кто оплатил, кто дошёл')}
          ${divider()}
          <p style="font-size:14px; color:#64748b; line-height:1.5; margin:0 0 16px;">
            Создайте событие, отправьте ссылку в группу — и посмотрите на результат.
          </p>
          ${ctaButton(`${APP_URL}/orgs`, 'Создать событие')}
        `, { preheader: 'MiniApp-регистрация + автонапоминания = больше людей на событии' }),
      }

    case 'video_overview':
      return {
        subject: '6-минутное демо: как организаторы сообществ используют Orbo',
        html: emailLayout(greeting, `
          <p style="font-size:15px; color:#334155; line-height:1.6; margin:0 0 20px;">
            Мы сделали короткое демо — посмотрите, как другие организаторы работают с Orbo и какие результаты получают.
          </p>
          ${featureRow('👥', 'База участников', 'Карточки с контактами, историей активности и AI-анализом интересов каждого — без ручного сбора')}
          ${featureRow('🎟', 'MiniApp для мероприятий', 'Регистрация и оплата прямо в Telegram за два нажатия. Автонапоминания повышают доходимость')}
          ${featureRow('📋', 'Заявки и воронка', 'Анкета на вступление через MiniApp, spam-score, обработка в канбан-доске')}
          ${ctaButton('https://orbo.ru/demo', 'Смотреть демо (6 мин)')}
          ${divider()}
          <p style="font-size:13px; color:#64748b; line-height:1.5; margin:0; text-align:center;">
            Всё это уже доступно в вашем аккаунте. <a href="${APP_URL}/orgs" style="color:#4f46e5; text-decoration:none;">Открыть Orbo →</a>
          </p>
        `, { preheader: '6 минут — и вы увидите Orbo в действии с реальным сообществом' }),
      }

    case 'reactivation_connect': {
      if (!ctx.hasTelegramLinked) {
        return {
          subject: 'Кажется, подключить Telegram не получилось — исправили, теперь это 30 секунд',
          html: emailLayout(greeting, `
            <p style="font-size:15px; color:#334155; line-height:1.6; margin:0 0 8px;">
              Это не очередное письмо из рассылки.
            </p>
            <p style="font-size:15px; color:#334155; line-height:1.6; margin:0 0 20px;">
              Мы заметили, что Telegram-аккаунт так и не подключился. Мы только что переделали этот шаг — теперь не нужно искать никаких кодов, всё происходит автоматически.
            </p>
            <p style="font-size:14px; font-weight:600; color:#1e1b4b; margin:0 0 12px;">Как подключить прямо сейчас:</p>
            ${stepRow('1', 'Нажмите кнопку ниже — откроется страница настройки')}
            ${stepRow('2', 'Нажмите «Подключить Telegram» → откроется бот → нажмите <b>Start</b>')}
            ${stepRow('3', 'Готово — аккаунт подключится автоматически')}
            ${ctaButton(`${APP_URL}/welcome`, 'Подключить Telegram')}
            ${hint('Если Telegram не открывается — может потребоваться VPN. Или напишите нам: <a href="https://t.me/timgorshkov" style="color:#94a3b8;">@timgorshkov</a>')}
          `, { preheader: 'Мы упростили подключение: одна кнопка — и готово' }),
        }
      } else {
        return {
          subject: 'Последний шаг до работающего Orbo: подключите группу',
          html: emailLayout(greeting, `
            <p style="font-size:15px; color:#334155; line-height:1.6; margin:0 0 8px;">
              Это не очередное письмо из рассылки.
            </p>
            <p style="font-size:15px; color:#334155; line-height:1.6; margin:0 0 20px;">
              Telegram-аккаунт подключён — отлично! Но группа ещё не добавлена в Orbo. Пока бот не в группе, карточки участников пустые и аналитика не работает.
            </p>
            <p style="font-size:14px; font-weight:600; color:#1e1b4b; margin:0 0 12px;">Как подключить группу за 2 минуты:</p>
            ${stepRow('1', 'Откройте <b>Настройки → Telegram → Доступные группы</b>')}
            ${stepRow('2', 'Выберите вашу группу из списка')}
            ${stepRow('3', 'Добавьте бота <b>@orbo_community_bot</b> как администратора группы')}
            ${ctaButton(`${APP_URL}/orgs`, 'Подключить группу')}
            ${hint('После подключения участники начнут появляться в карточках автоматически')}
          `, { preheader: 'Один шаг — и участники появятся в Orbo автоматически' }),
        }
      }
    }

    case 'check_in':
      return {
        subject: 'Как дела с Orbo? Ответьте одним словом',
        html: emailLayout(greeting, `
          <p style="font-size:15px; color:#334155; line-height:1.6; margin:0 0 16px;">
            Прошла неделя с регистрации. Мне важно знать — получилось ли настроить?
          </p>
          <p style="font-size:15px; color:#334155; line-height:1.6; margin:0 0 16px;">
            Если что-то не работает, непонятно или не хватает какой-то функции — <b>просто ответьте на это письмо</b>. Я читаю каждый ответ лично.
          </p>
          <p style="font-size:15px; color:#334155; line-height:1.6; margin:0 0 20px;">
            Мне помогут даже короткие ответы: «не разобрался», «нет нужной функции», «всё ок» — любой формат.
          </p>
          ${ctaButton(`${APP_URL}/orgs`, 'Открыть Orbo')}
          ${divider()}
          <p style="font-size:14px; color:#64748b; line-height:1.5; margin:0; text-align:center;">
            Или напишите в Telegram — обычно отвечаем в течение часа<br>
            <a href="https://t.me/timgorshkov" style="color:#4f46e5; text-decoration:none; font-weight:600;">@timgorshkov →</a>
          </p>
        `, { preheader: 'Ответьте одним словом: получилось или нет' }),
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
        `${hi}аккаунт создан 🎉\n\n` +
        `Три шага до первого результата:\n\n` +
        `1️⃣ <b>Подключите группу</b> — добавьте бота, и участники начнут появляться в карточках с именами и профилями\n\n` +
        `2️⃣ <b>Создайте событие</b> — MiniApp для регистрации прямо в Telegram + автонапоминания в личку\n\n` +
        `3️⃣ <b>Поделитесь ссылкой</b> — отправьте в группу и получите регистрации\n\n` +
        `→ <a href="${APP_URL}/orgs">Начать настройку</a>`
      )

    case 'add_group':
      return (
        `${hi}пока нет группы — Orbo не видит участников\n\n` +
        `Добавьте бота в группу как администратора, и:\n` +
        `• Участники появятся с именами, username, активностью\n` +
        `• Запустится аналитика — кто пишет, кто молчит\n` +
        `• Контакты сохранятся, даже если Telegram станет недоступен\n\n` +
        `Занимает 2 минуты → <a href="${APP_URL}/orgs">Подключить</a>`
      )

    case 'import_history':
      return (
        `${hi}группа подключена, но бот видит только последние 5–30 человек\n\n` +
        `Чтобы восстановить всю базу — загрузите историю из Telegram Desktop:\n\n` +
        `1️⃣ Откройте группу в <b>Telegram Desktop</b>\n` +
        `2️⃣ Нажмите <b>⋯ → Экспорт истории чата → формат JSON</b>\n` +
        `3️⃣ Загрузите файл: <b>Orbo → Telegram → группа → Импорт истории</b>\n\n` +
        `Orbo распознает участников по Telegram ID — точно и без дубликатов.\n\n` +
        `→ <a href="${APP_URL}/orgs">Загрузить историю</a>`
      )

    case 'create_event':
      return (
        `${hi}попробуйте создать событие 🎟\n\n` +
        `Самый быстрый способ проверить Orbo:\n\n` +
        `⚡ <b>MiniApp</b> — регистрация в один тап, без перехода на сайт\n` +
        `🔔 <b>Напоминания</b> — бот пишет каждому в личку за 24ч и за 1ч\n` +
        `💰 <b>Оплаты</b> — видно, кто зарегистрировался и оплатил\n\n` +
        `Создайте → отправьте ссылку в группу → посмотрите результат\n\n` +
        `→ <a href="${APP_URL}/orgs">Создать событие</a>`
      )

    case 'video_overview':
      return (
        `${hi}мы сделали короткое демо 🎬\n\n` +
        `6 минут — и вы увидите, как другие организаторы используют Orbo для работы с сообществом:\n\n` +
        `👥 База участников с историей активности\n` +
        `🎟 MiniApp для мероприятий и регистраций\n` +
        `📋 Заявки на вступление и воронка\n\n` +
        `→ <a href="https://orbo.ru/demo">Смотреть демо (6 мин)</a>`
      )

    case 'reactivation_connect':
      return (
        `Привет! Это не очередное напоминание из рассылки.\n\n` +
        `Мы заметили, что группа так и не подключена к Orbo. Без этого бот не видит ваших участников и аналитика не работает.\n\n` +
        `Как исправить за 2 минуты:\n\n` +
        `1️⃣ Добавьте <b>@orbo_community_bot</b> в вашу группу как администратора\n` +
        `2️⃣ Перейдите в настройки Orbo → Telegram → Доступные группы\n` +
        `3️⃣ Выберите группу — и готово\n\n` +
        `→ <a href="${APP_URL}/orgs">Открыть настройки</a>\n\n` +
        `Если возникнут трудности — напишите мне лично: @timgorshkov`
      )

    case 'check_in':
      return (
        `${hi}как дела с Orbo? 👋\n\n` +
        `Прошла неделя. Мне важно знать — получилось настроить?\n\n` +
        `Если что-то непонятно или не хватает — напишите мне прямо сюда, даже коротко. Отвечу лично.\n\n` +
        `@timgorshkov — основатель`
      )

    default:
      throw new Error(`Unknown TG step: ${stepKey}`)
  }
}

// ---------------------------------------------------------------------------
// HTML email helpers — modern, polished design
// ---------------------------------------------------------------------------

function emailLayout(greeting: string, body: string, options?: { preheader?: string }): string {
  const preheader = options?.preheader || ''
  return `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Orbo</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0; padding:0; background-color:#f4f5f7; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; -webkit-font-smoothing:antialiased;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;">
    <tr><td align="center" style="padding:32px 16px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <!-- Header -->
        <tr><td style="padding:0 0 24px; text-align:center;">
          <a href="https://orbo.ru" style="text-decoration:none; display:inline-flex; align-items:center; gap:8px;">
            <span style="display:inline-block; width:32px; height:32px; background:linear-gradient(135deg,#4f46e5,#7c3aed); border-radius:8px; line-height:32px; text-align:center; color:#fff; font-weight:800; font-size:16px;">O</span>
            <span style="font-size:20px; font-weight:700; color:#1e1b4b; letter-spacing:-0.5px;">Orbo</span>
          </a>
        </td></tr>

        <!-- Body card -->
        <tr><td style="background:#ffffff; border-radius:16px; box-shadow:0 1px 3px rgba(0,0,0,0.08); padding:36px 32px 32px;">
          <p style="font-size:17px; font-weight:600; color:#1e1b4b; margin:0 0 16px;">${greeting}!</p>
          ${body}
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:24px 0 0; text-align:center;">
          <p style="margin:0 0 6px; font-size:13px; color:#94a3b8;">Orbo — CRM для групп и сообществ</p>
          <p style="margin:0 0 12px; font-size:12px; color:#94a3b8;">
            <a href="https://orbo.ru" style="color:#6366f1; text-decoration:none;">orbo.ru</a>
            &nbsp;&middot;&nbsp;
            <a href="${APP_URL}" style="color:#6366f1; text-decoration:none;">my.orbo.ru</a>
            &nbsp;&middot;&nbsp;
            <a href="https://t.me/timgorshkov" style="color:#6366f1; text-decoration:none;">Telegram</a>
          </p>
          <p style="margin:0; font-size:11px; color:#cbd5e1;">Данные хранятся на серверах в России</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`.trim()
}

function ctaButton(href: string, text: string): string {
  return `
  <div style="text-align:center; margin:24px 0 8px;">
    <a href="${href}" style="display:inline-block; background-color:#4f46e5; color:#ffffff; padding:14px 32px; text-decoration:none; border-radius:10px; font-weight:600; font-size:15px; letter-spacing:-0.2px; mso-padding-alt:0;">
      <!--[if mso]><i style="letter-spacing:32px;mso-font-width:-100%;mso-text-raise:21pt">&nbsp;</i><![endif]-->
      <span style="mso-text-raise:10pt;">${text}</span>
      <!--[if mso]><i style="letter-spacing:32px;mso-font-width:-100%">&nbsp;</i><![endif]-->
    </a>
  </div>`
}

function featureRow(emoji: string, title: string, description: string): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
    <tr>
      <td width="36" valign="top" style="padding-top:2px; font-size:18px;">${emoji}</td>
      <td style="padding-left:8px;">
        <p style="margin:0; font-size:14px; font-weight:600; color:#1e1b4b;">${title}</p>
        <p style="margin:2px 0 0; font-size:13px; color:#64748b; line-height:1.5;">${description}</p>
      </td>
    </tr>
  </table>`
}

function stepRow(num: string, text: string): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
    <tr>
      <td width="28" valign="top" style="padding-top:1px;">
        <div style="width:24px; height:24px; background:#eef2ff; border-radius:50%; text-align:center; line-height:24px; font-size:12px; font-weight:700; color:#4f46e5;">${num}</div>
      </td>
      <td style="padding-left:8px; font-size:14px; color:#334155; line-height:1.5;">${text}</td>
    </tr>
  </table>`
}

function divider(): string {
  return `<hr style="border:none; border-top:1px solid #f1f5f9; margin:20px 0;">`
}

function hint(text: string): string {
  return `<p style="font-size:12px; color:#94a3b8; margin:16px 0 0; text-align:center;">${text}</p>`
}

// ---------------------------------------------------------------------------
// Template preview export (for superadmin)
// ---------------------------------------------------------------------------

const STEP_LABELS: Record<string, string> = {
  connect_telegram: 'Привяжите Telegram',
  workspace_ready: 'Аккаунт создан',
  add_group: 'Подключите группу',
  create_event: 'Создайте событие',
  video_overview: 'Демо-видео',
  reactivation_connect: 'Реактивация: подключение',
  check_in: 'Как дела?',
}

const SKIP_LABELS: Record<string, string> = {
  connect_telegram: 'Telegram уже привязан',
  add_group: 'Группа уже подключена',
  create_event: 'Событие уже создано',
  reactivation_connect: 'Telegram и группа уже подключены',
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
    hasImport: false,
    hasEvent: false,
    emailVerified: true,
  }

  const delayMap: Record<number, string> = {
    [5 * 60 * 1000]: '+5 мин',
    [30 * 60 * 1000]: '+30 мин',
    [4 * HOUR]: '+4 часа',
    [1 * HOUR]: '+1 час',
    [1 * DAY]: '+1 день',
    [2 * DAY]: '+2 дня',
    [3 * DAY]: '+3 дня',
    [4 * DAY]: '+4 дня',
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
