/**
 * Registration Confirmation Service
 *
 * Sends confirmation messages after successful event registration:
 * - Telegram DM (tries multiple bots: notifications → event → main)
 * - Email with QR code if applicable
 *
 * For paid events, confirmations are sent only after payment is confirmed.
 * For free events, confirmations are sent immediately after registration.
 */

import { createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'
import { telegramFetch } from '@/lib/services/telegramService'
import { getEmailService } from '@/lib/services/emailService'
import { getShortCode } from '@/lib/utils/qrTicket'
import { applyTemplate, DEFAULT_EVENT_EMAIL_TEMPLATE, type TemplateVars } from '@/lib/utils/templateRenderer'
import { marked } from 'marked'

const logger = createServiceLogger('RegistrationConfirmation')

interface ConfirmationParams {
  registrationId: string
  eventId: string
  orgId: string
  participantId: string
  qrToken: string | null
}

/**
 * Main entry point. Fire-and-forget — never throws.
 */
export async function sendRegistrationConfirmation(params: ConfirmationParams): Promise<void> {
  try {
    const db = createAdminServer()

    // Load all needed data in parallel.
    // Always pull registration_data — for in-form fields (email, full_name) that may
    // not be on the participant record itself (typical for shadow profiles created
    // from a TG event or first-time registrants).
    const [eventResult, participantResult, orgResult, regResult] = await Promise.all([
      db.from('events').select('title, event_date, start_time, end_time, location_info, event_type, enable_qr_checkin, cover_image_url, requires_payment').eq('id', params.eventId).single(),
      db.from('participants').select('full_name, username, email, tg_user_id').eq('id', params.participantId).single(),
      db.from('organizations').select('name, logo_url, event_email_template').eq('id', params.orgId).single(),
      db.from('event_registrations').select('qr_token, registration_data, payment_status, paid_amount, price').eq('id', params.registrationId).single(),
    ])

    const event = eventResult.data
    const participant = participantResult.data
    const org = orgResult.data
    const regRow: any = regResult.data || {}
    const regData: any = regRow.registration_data || {}
    const qrToken = regRow.qr_token || params.qrToken

    if (!event || !participant) {
      logger.warn({ ...params }, 'Missing event or participant data, skipping confirmation')
      return
    }

    // Resolve email and full name with fallback chain:
    //   1. registration_data (explicitly entered in the event registration form)
    //   2. participant record
    const formEmail = typeof regData.email === 'string' ? regData.email.trim() : ''
    const recipientEmail = formEmail || participant.email || null

    const formFullName = typeof regData.full_name === 'string' ? regData.full_name.trim() : ''
    const formName = typeof regData.name === 'string' ? regData.name.trim() : ''
    const orgName = org?.name || 'Orbo'
    const orgLogo = org?.logo_url || null
    const participantName = formFullName || formName || participant.full_name || participant.username || 'Участник'
    const hasQr = event.enable_qr_checkin && qrToken
    const eventUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru'}/e/${params.eventId}`

    const dateStr = formatEventDate(event.event_date)
    const timeStr = formatTime(event.start_time)
    const endTimeStr = event.end_time ? formatTime(event.end_time) : null

    // Build template variables
    const vars: TemplateVars = {
      event: {
        title: event.title,
        date: dateStr,
        time: timeStr,
        endTime: endTimeStr || '',
        location: event.event_type === 'online' ? 'Онлайн' : (event.location_info || ''),
        url: eventUrl,
        type: event.event_type,
      },
      participant: {
        name: participantName,
      },
      org: {
        name: orgName,
      },
      ticket: {
        shortCode: qrToken ? getShortCode(qrToken) : '',
        amount: regRow.paid_amount ? Number(regRow.paid_amount) : (regRow.price ? Number(regRow.price) : 0),
        paid: regRow.payment_status === 'paid',
        requiresPayment: !!event.requires_payment,
      },
    }

    // Apply org template (or fall back to platform default)
    const tpl = pickTemplate(org?.event_email_template)
    const subject = applyTemplate(tpl.subject, vars)
    const bodyMd = applyTemplate(tpl.bodyMarkdown, vars)
    const qrInstructionMd = applyTemplate(tpl.qrInstructionMarkdown || '', vars)

    // Send Telegram and Email in parallel
    await Promise.allSettled([
      sendTelegramConfirmation({
        tgUserId: participant.tg_user_id ? Number(participant.tg_user_id) : null,
        bodyMarkdown: bodyMd,
        qrInstructionMarkdown: qrInstructionMd,
        eventUrl,
        hasQr,
        qrToken,
        orgName,
      }),
      sendEmailConfirmation({
        email: recipientEmail,
        subject,
        bodyMarkdown: bodyMd,
        qrInstructionMarkdown: qrInstructionMd,
        hasQr,
        qrToken,
        orgName,
        orgLogo,
        eventUrl,
      }),
    ])

    logger.info({
      registration_id: params.registrationId,
      event_id: params.eventId,
      has_tg: !!participant.tg_user_id,
      has_email: !!recipientEmail,
      email_source: formEmail ? 'registration_data' : (participant.email ? 'participant' : 'none'),
      has_qr: hasQr,
    }, 'Registration confirmation sent')
  } catch (err) {
    logger.error({ error: String(err), ...params }, 'Failed to send registration confirmation')
  }
}

// ─── Telegram ───────────────────────────────────────────────

interface TgParams {
  tgUserId: number | null
  bodyMarkdown: string
  qrInstructionMarkdown: string
  eventUrl: string
  hasQr: boolean
  qrToken: string | null
  orgName: string
}

async function sendTelegramConfirmation(p: TgParams): Promise<void> {
  if (!p.tgUserId) return

  // Convert the markdown body to Telegram-flavoured HTML. Telegram supports a tiny
  // HTML subset: <b> <i> <u> <s> <code> <pre> <a> <br>. We render via marked then
  // sanitise: only those tags are kept, the rest are stripped.
  let bodyHtml = markdownToTelegramHtml(p.bodyMarkdown)
  if (p.hasQr && p.qrToken && p.qrInstructionMarkdown) {
    bodyHtml += '\n\n' + markdownToTelegramHtml(p.qrInstructionMarkdown)
  }
  const text = bodyHtml.trim()

  // Try bots in priority order
  const botTokens = [
    process.env.TELEGRAM_NOTIFICATIONS_BOT_TOKEN,
    process.env.TELEGRAM_EVENT_BOT_TOKEN,
    process.env.TELEGRAM_BOT_TOKEN,
  ].filter(Boolean) as string[]

  for (const token of botTokens) {
    try {
      // Check access
      const checkRes = await telegramFetch(
        `https://api.telegram.org/bot${token}/getChat`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: p.tgUserId }) }
      )
      const checkData = await checkRes.json()
      if (!checkData.ok) continue // bot not started, try next

      // Send QR image + caption, or just text
      if (p.hasQr && p.qrToken) {
        const qrImageUrl = `https://quickchart.io/qr?text=${encodeURIComponent(p.qrToken)}&size=400&margin=2&format=png`
        const photoRes = await telegramFetch(
          `https://api.telegram.org/bot${token}/sendPhoto`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: p.tgUserId,
              photo: qrImageUrl,
              caption: text,
              parse_mode: 'HTML',
            }),
          }
        )
        const photoData = await photoRes.json()
        if (photoData.ok) {
          logger.debug({ tg_user_id: p.tgUserId }, 'TG confirmation with QR sent')
          return
        }
        // If sendPhoto fails, fall back to text
      }

      // Text-only message
      const msgRes = await telegramFetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: p.tgUserId,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          }),
        }
      )
      const msgData = await msgRes.json()
      if (msgData.ok) {
        logger.debug({ tg_user_id: p.tgUserId }, 'TG confirmation text sent')
        return
      }
    } catch (err) {
      logger.debug({ tg_user_id: p.tgUserId, error: String(err) }, 'Bot attempt failed, trying next')
    }
  }

  logger.warn({ tg_user_id: p.tgUserId }, 'Could not send TG confirmation via any bot')
}

// ─── Email ──────────────────────────────────────────────────

interface EmailParams {
  email: string | null
  subject: string
  bodyMarkdown: string
  qrInstructionMarkdown: string
  hasQr: boolean
  qrToken: string | null
  orgName: string
  orgLogo: string | null
  eventUrl: string
}

async function sendEmailConfirmation(p: EmailParams): Promise<void> {
  if (!p.email) return

  const emailService = getEmailService()
  const html = buildEmailHtml(p)

  try {
    await emailService.sendEmail({ to: p.email, subject: p.subject, html })
    logger.info({ to: p.email, has_qr: p.hasQr }, 'Registration email sent')
  } catch (err: any) {
    logger.error({ to: p.email, error: err?.message, stack: err?.stack }, 'Failed to send registration confirmation email')
  }
}

/**
 * Render the email HTML wrapping the user-supplied markdown body in our brand layout.
 * Exported for the preview / test endpoints.
 */
export function buildEmailHtml(p: {
  bodyMarkdown: string
  qrInstructionMarkdown: string
  hasQr: boolean
  qrToken: string | null
  orgName: string
  orgLogo: string | null
}): string {
  const bodyHtml = marked.parse(p.bodyMarkdown || '', { async: false, gfm: true, breaks: true }) as string
  const qrInstructionHtml = p.qrInstructionMarkdown
    ? (marked.parse(p.qrInstructionMarkdown, { async: false, gfm: true, breaks: true }) as string)
    : ''

  const qrImageTag = p.hasQr && p.qrToken
    ? `<div style="text-align:center;margin:24px 0;">
         <p style="font-size:14px;color:#555;margin-bottom:8px;">QR-код для входа:</p>
         <img src="https://quickchart.io/qr?text=${encodeURIComponent(p.qrToken)}&size=400&margin=2&format=png"
              alt="QR-код" width="200" height="200" style="border:1px solid #e5e7eb;border-radius:8px;" />
         <p style="font-family:monospace;font-size:13px;color:#666;letter-spacing:2px;margin-top:8px;">
           Код билета: ${getShortCode(p.qrToken)}
         </p>
         <div style="font-size:13px;color:#6b7280;margin-top:8px;">${qrInstructionHtml}</div>
       </div>`
    : ''

  const logoHtml = p.orgLogo
    ? `<img src="${p.orgLogo}" alt="${escapeHtml(p.orgName)}" width="40" height="40" style="border-radius:8px;margin-right:12px;vertical-align:middle;" />`
    : ''

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb;margin:0;padding:0;">
  <div style="max-width:520px;margin:0 auto;padding:24px;">
    <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <div style="background:#10b981;padding:24px;text-align:center;">
        <div style="font-size:36px;margin-bottom:8px;">✅</div>
        <h1 style="color:#fff;font-size:20px;margin:0;">Вы зарегистрированы!</h1>
      </div>

      <div style="padding:24px;color:#374151;font-size:15px;line-height:1.55;">
        <div class="email-body">${bodyHtml}</div>
        ${qrImageTag}
      </div>

      <div style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
        <div style="display:inline-flex;align-items:center;">
          ${logoHtml}
          <span style="color:#6b7280;font-size:13px;">${escapeHtml(p.orgName)}</span>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`
}

// ─── Helpers ────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function formatEventDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' })
  } catch {
    return dateStr
  }
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return ''
  return timeStr.substring(0, 5) // HH:MM:SS → HH:MM
}

/**
 * Picks an org's saved template, falling back to platform default for any missing
 * field. Robust to bad input from the DB (random JSON, missing keys, wrong types).
 */
export function pickTemplate(saved: any): { subject: string; bodyMarkdown: string; qrInstructionMarkdown: string } {
  const def = DEFAULT_EVENT_EMAIL_TEMPLATE
  if (!saved || typeof saved !== 'object') {
    return { subject: def.subject, bodyMarkdown: def.bodyMarkdown, qrInstructionMarkdown: def.qrInstructionMarkdown }
  }
  return {
    subject: typeof saved.subject === 'string' && saved.subject.trim() ? saved.subject : def.subject,
    bodyMarkdown: typeof saved.bodyMarkdown === 'string' && saved.bodyMarkdown.trim() ? saved.bodyMarkdown : def.bodyMarkdown,
    qrInstructionMarkdown: typeof saved.qrInstructionMarkdown === 'string' ? saved.qrInstructionMarkdown : def.qrInstructionMarkdown,
  }
}

/**
 * Convert markdown to Telegram-flavoured HTML (subset: <b>, <i>, <u>, <s>, <code>,
 * <pre>, <a>). We render via marked, then strip every other tag to comply with
 * Telegram's "Bot API HTML" parse mode.
 */
function markdownToTelegramHtml(md: string): string {
  if (!md) return ''
  let html = marked.parse(md, { async: false, gfm: true, breaks: true }) as string

  // Replace block-level wrappers with newlines
  html = html
    .replace(/<\/(p|h[1-6]|li|ul|ol|blockquote|hr|div)>/gi, '\n')
    .replace(/<(p|h[1-6]|li|ul|ol|blockquote|hr|div)([^>]*)>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')

  // Convert <strong>/<em> to <b>/<i> which Telegram accepts
  html = html
    .replace(/<strong[^>]*>/gi, '<b>')
    .replace(/<\/strong>/gi, '</b>')
    .replace(/<em[^>]*>/gi, '<i>')
    .replace(/<\/em>/gi, '</i>')

  // Strip every tag we don't allow. Whitelist: b,i,u,s,code,pre,a (with href attr).
  html = html.replace(/<(?!\/?(b|i|u|s|code|pre|a)(\s|>|\/))[^>]*>/gi, '')

  // Collapse 3+ newlines to 2
  html = html.replace(/\n{3,}/g, '\n\n').trim()

  return html
}
