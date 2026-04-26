import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createCronLogger } from '@/lib/logger'
import { sendEmail } from '@/lib/services/email'
import { telegramFetch } from '@/lib/services/telegramService'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/cron/billing-trial-reminders
 *
 * Runs once daily. For each org in trial:
 *   T-3 days: send email + TG notification + mark banner flag
 *   T-1 day:  send repeat email reminder
 *   T=0:      downgrade to free, send "trial ended" email (soft downgrade)
 *
 * Recipients: org owner(s) by email. Additionally TG notification via orbo_assistant_bot
 * if owner has a verified Telegram account in user_telegram_accounts (any org) OR
 * has linked Telegram via accounts provider=telegram.
 */
export async function POST(request: NextRequest) {
  const logger = createCronLogger('billing-trial-reminders')

  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminServer()
  const now = new Date()
  const stats = {
    reminders_3d: 0,
    reminders_1d: 0,
    downgraded: 0,
    tg_sent: 0,
    email_sent: 0,
    errors: 0,
  }

  try {
    // Fetch all orgs with active trial (plan != free, status = 'trial', expires_at in future)
    const { data: trialSubs } = await db.raw(
      `SELECT s.org_id, s.plan_code, s.expires_at, s.started_at,
              o.name as org_name,
              bp.name as plan_name
       FROM org_subscriptions s
       JOIN organizations o ON o.id = s.org_id
       LEFT JOIN billing_plans bp ON bp.code = s.plan_code
       WHERE s.status = 'trial'
         AND s.plan_code != 'free'
         AND s.expires_at IS NOT NULL`,
      []
    )

    if (!trialSubs || trialSubs.length === 0) {
      logger.info({}, 'No active trials found')
      return NextResponse.json({ success: true, stats })
    }

    logger.info({ trials_count: trialSubs.length }, 'Processing trial reminders')

    for (const sub of trialSubs) {
      try {
        const expiresAt = new Date(sub.expires_at)
        const daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))

        // Determine action by days remaining
        let action: 'remind_3d' | 'remind_1d' | 'downgrade' | null = null
        if (daysRemaining <= 0) action = 'downgrade'
        else if (daysRemaining === 1) action = 'remind_1d'
        else if (daysRemaining === 3) action = 'remind_3d'
        else continue // No action this run

        // Check if we already sent this reminder (idempotency via unique dedup_key per day)
        const today = now.toISOString().slice(0, 10) // YYYY-MM-DD
        const logKey = `trial_${action}_${sub.org_id}_${today}`
        const { data: existingLog } = await db
          .from('billing_reminder_logs')
          .select('id')
          .eq('dedup_key', logKey)
          .limit(1)
          .maybeSingle()

        if (existingLog) {
          logger.debug({ org_id: sub.org_id, action }, 'Reminder already sent today, skipping')
          continue
        }

        // Find owner(s) and their contacts
        const { data: owners } = await db.raw(
          `SELECT DISTINCT u.id as user_id, u.email, u.tg_user_id as direct_tg_user_id
           FROM memberships m
           JOIN users u ON u.id = m.user_id
           WHERE m.org_id = $1 AND m.role = 'owner'`,
          [sub.org_id]
        )

        if (!owners || owners.length === 0) {
          logger.warn({ org_id: sub.org_id }, 'No owner found for trial org')
          continue
        }

        for (const owner of owners) {
          // Find any verified TG account (from this or any other org)
          let tgUserId: number | null = owner.direct_tg_user_id ? Number(owner.direct_tg_user_id) : null
          if (!tgUserId) {
            const { data: tgAccount } = await db
              .from('user_telegram_accounts')
              .select('telegram_user_id')
              .eq('user_id', owner.user_id)
              .eq('is_verified', true)
              .limit(1)
              .maybeSingle()
            if (tgAccount?.telegram_user_id) tgUserId = Number(tgAccount.telegram_user_id)
          }
          if (!tgUserId) {
            const { data: tgProvider } = await db
              .from('accounts')
              .select('provider_account_id')
              .eq('user_id', owner.user_id)
              .eq('provider', 'telegram')
              .limit(1)
              .maybeSingle()
            if (tgProvider?.provider_account_id) tgUserId = Number(tgProvider.provider_account_id)
          }

          // Perform action
          if (action === 'downgrade') {
            // Downgrade to free (soft: no feature block, just plan change + notification)
            await db
              .from('org_subscriptions')
              .update({
                plan_code: 'free',
                status: 'active',
                expires_at: null,
              })
              .eq('org_id', sub.org_id)

            await db
              .from('organizations')
              .update({ plan: 'free' })
              .eq('id', sub.org_id)

            stats.downgraded++

            const { subject, emailHtml, tgText } = buildMessages({
              action,
              orgName: sub.org_name,
              planName: sub.plan_name || sub.plan_code,
              daysRemaining,
              orgId: sub.org_id,
            })

            if (owner.email) {
              const res = await sendEmail({ to: owner.email, subject, html: emailHtml, tags: ['billing', 'trial-ended'] })
              if (res.success) stats.email_sent++
            }
            if (tgUserId) {
              const sent = await sendTgMessage(tgUserId, tgText)
              if (sent) stats.tg_sent++
            }
          } else {
            const { subject, emailHtml, tgText } = buildMessages({
              action,
              orgName: sub.org_name,
              planName: sub.plan_name || sub.plan_code,
              daysRemaining,
              orgId: sub.org_id,
            })

            if (owner.email) {
              const res = await sendEmail({ to: owner.email, subject, html: emailHtml, tags: ['billing', `trial-${action}`] })
              if (res.success) stats.email_sent++
            }
            if (tgUserId) {
              const sent = await sendTgMessage(tgUserId, tgText)
              if (sent) stats.tg_sent++
            }

            if (action === 'remind_3d') stats.reminders_3d++
            else stats.reminders_1d++
          }

          // Record in billing_reminder_logs for idempotency
          await db
            .from('billing_reminder_logs')
            .insert({
              org_id: sub.org_id,
              user_id: owner.user_id,
              reminder_type: `trial_${action}`,
              dedup_key: logKey,
              email_sent: !!owner.email,
              tg_sent: !!tgUserId,
              metadata: {
                plan_code: sub.plan_code,
                days_remaining: daysRemaining,
              },
            })
        }
      } catch (subErr: any) {
        stats.errors++
        logger.error({ org_id: sub.org_id, error: subErr.message }, 'Failed to process trial sub')
      }
    }

    logger.info({ stats }, 'Trial reminders cron completed')
    return NextResponse.json({ success: true, stats })
  } catch (error: any) {
    logger.error({ error: error.message }, 'Trial reminders cron failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

async function sendTgMessage(tgUserId: number, text: string): Promise<boolean> {
  const botToken = process.env.TELEGRAM_NOTIFICATIONS_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) return false

  try {
    const res = await telegramFetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: tgUserId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })
    const data: any = await res.json()
    return data?.ok === true
  } catch {
    return false
  }
}

function buildMessages(p: {
  action: 'remind_3d' | 'remind_1d' | 'downgrade'
  orgName: string
  planName: string
  daysRemaining: number
  orgId: string
}): { subject: string; emailHtml: string; tgText: string } {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru'
  const billingUrl = `${appUrl}/p/${p.orgId}/settings?tab=billing`

  if (p.action === 'remind_3d') {
    return {
      subject: `Пробный период «${p.planName}» заканчивается через 3 дня`,
      emailHtml: `
        <p>Здравствуйте!</p>
        <p>Пробный период тарифа <strong>«${p.planName}»</strong> в организации «${p.orgName}» заканчивается через 3 дня.</p>
        <p>Чтобы продолжить пользоваться расширенными возможностями, оплатите подписку на удобный период (1, 3 или 12 месяцев):</p>
        <p><a href="${billingUrl}" style="display:inline-block;padding:10px 20px;background:#7c3aed;color:white;text-decoration:none;border-radius:6px">Оплатить подписку</a></p>
        <p>Если не оплатите — через 3 дня тариф автоматически переключится на «Бесплатный». Все ваши данные сохранятся, но расширенные функции станут недоступны.</p>
      `,
      tgText: `⏰ <b>Пробный период заканчивается через 3 дня</b>\n\nТариф «${p.planName}» в организации «${p.orgName}» доступен ещё 3 дня.\n\n<a href="${billingUrl}">Оплатить подписку →</a>`,
    }
  }

  if (p.action === 'remind_1d') {
    return {
      subject: `Последний день пробного периода «${p.planName}»`,
      emailHtml: `
        <p>Здравствуйте!</p>
        <p>Сегодня — последний день пробного периода тарифа <strong>«${p.planName}»</strong> в организации «${p.orgName}».</p>
        <p>Завтра тариф автоматически переключится на «Бесплатный», если подписка не будет оплачена.</p>
        <p><a href="${billingUrl}" style="display:inline-block;padding:10px 20px;background:#7c3aed;color:white;text-decoration:none;border-radius:6px">Оплатить прямо сейчас</a></p>
      `,
      tgText: `🚨 <b>Последний день пробного периода</b>\n\nЗавтра тариф «${p.planName}» («${p.orgName}») переключится на «Бесплатный».\n\n<a href="${billingUrl}">Оплатить сейчас →</a>`,
    }
  }

  // downgrade
  return {
    subject: `Пробный период «${p.planName}» завершён`,
    emailHtml: `
      <p>Здравствуйте!</p>
      <p>Пробный период тарифа <strong>«${p.planName}»</strong> в организации «${p.orgName}» завершился. Тариф переключён на «Бесплатный».</p>
      <p>Все ваши данные сохранены. Чтобы вернуть расширенные возможности, оплатите подписку в любой момент:</p>
      <p><a href="${billingUrl}" style="display:inline-block;padding:10px 20px;background:#7c3aed;color:white;text-decoration:none;border-radius:6px">Вернуться на «${p.planName}»</a></p>
    `,
    tgText: `Пробный период тарифа «${p.planName}» («${p.orgName}») завершился — переключено на «Бесплатный».\n\nДля возврата расширенных возможностей: <a href="${billingUrl}">Оплатить подписку →</a>`,
  }
}
