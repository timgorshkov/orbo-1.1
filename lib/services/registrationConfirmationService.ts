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
      db.from('events').select('title, event_date, start_time, end_time, location_info, event_type, enable_qr_checkin, cover_image_url').eq('id', params.eventId).single(),
      db.from('participants').select('full_name, username, email, tg_user_id').eq('id', params.participantId).single(),
      db.from('organizations').select('name, logo_url').eq('id', params.orgId).single(),
      db.from('event_registrations').select('qr_token, registration_data').eq('id', params.registrationId).single(),
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
    // Reason: a participant created from Telegram (shadow profile) won't have an
    // email until the registrant types one into the event form — and the typed
    // value lives in event_registrations.registration_data, not on the participant.
    const formEmail = typeof regData.email === 'string' ? regData.email.trim() : ''
    const recipientEmail = formEmail || participant.email || null

    const formFullName = typeof regData.full_name === 'string' ? regData.full_name.trim() : ''
    const formName = typeof regData.name === 'string' ? regData.name.trim() : ''
    const orgName = org?.name || 'Orbo'
    const orgLogo = org?.logo_url || null
    const participantName = formFullName || formName || participant.full_name || participant.username || 'Участник'
    const hasQr = event.enable_qr_checkin && qrToken
    const eventUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru'}/e/${params.eventId}`

    // Format date/time
    const dateStr = formatEventDate(event.event_date)
    const timeStr = formatTime(event.start_time)
    const endTimeStr = event.end_time ? formatTime(event.end_time) : null

    // Send Telegram and Email in parallel
    await Promise.allSettled([
      sendTelegramConfirmation({
        tgUserId: participant.tg_user_id ? Number(participant.tg_user_id) : null,
        participantName,
        eventTitle: event.title,
        dateStr,
        timeStr,
        endTimeStr,
        location: event.location_info,
        eventType: event.event_type,
        eventUrl,
        hasQr,
        qrToken,
        orgName,
      }),
      sendEmailConfirmation({
        email: recipientEmail,
        participantName,
        eventTitle: event.title,
        dateStr,
        timeStr,
        endTimeStr,
        location: event.location_info,
        eventType: event.event_type,
        eventUrl,
        hasQr,
        qrToken,
        orgName,
        orgLogo,
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
  participantName: string
  eventTitle: string
  dateStr: string
  timeStr: string
  endTimeStr: string | null
  location: string | null
  eventType: string | null
  eventUrl: string
  hasQr: boolean
  qrToken: string | null
  orgName: string
}

async function sendTelegramConfirmation(p: TgParams): Promise<void> {
  if (!p.tgUserId) return

  // Build message (HTML parse mode)
  let text = `✅ <b>Вы зарегистрированы!</b>\n\n`
  text += `📌 <b>${escapeHtml(p.eventTitle)}</b>\n`
  text += `📅 ${p.dateStr}`
  if (p.timeStr) text += `, ${p.timeStr}`
  if (p.endTimeStr) text += ` — ${p.endTimeStr}`
  text += '\n'
  if (p.location) {
    text += p.eventType === 'online'
      ? `🌐 Онлайн\n`
      : `📍 ${escapeHtml(p.location)}\n`
  }
  text += `\n🔗 <a href="${p.eventUrl}">Подробнее о событии</a>`
  if (p.hasQr && p.qrToken) {
    text += `\n\n🎫 QR-код для входа прикреплён ниже`
    text += `\nКод билета: <code>${getShortCode(p.qrToken)}</code>`
  }

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
  participantName: string
  eventTitle: string
  dateStr: string
  timeStr: string
  endTimeStr: string | null
  location: string | null
  eventType: string | null
  eventUrl: string
  hasQr: boolean
  qrToken: string | null
  orgName: string
  orgLogo: string | null
}

async function sendEmailConfirmation(p: EmailParams): Promise<void> {
  if (!p.email) return

  const emailService = getEmailService()

  const qrImageTag = p.hasQr && p.qrToken
    ? `<div style="text-align:center;margin:24px 0;">
         <p style="font-size:14px;color:#555;margin-bottom:8px;">QR-код для входа:</p>
         <img src="https://quickchart.io/qr?text=${encodeURIComponent(p.qrToken)}&size=400&margin=2&format=png"
              alt="QR-код" width="200" height="200" style="border:1px solid #e5e7eb;border-radius:8px;" />
         <p style="font-family:monospace;font-size:13px;color:#666;letter-spacing:2px;margin-top:8px;">
           Код билета: ${getShortCode(p.qrToken)}
         </p>
         <p style="font-size:12px;color:#9ca3af;margin-top:4px;">
           Если QR не считается — назовите этот код на входе
         </p>
       </div>`
    : ''

  const locationHtml = p.location
    ? p.eventType === 'online'
      ? `<tr><td style="padding:4px 0;color:#666;">Формат:</td><td style="padding:4px 0;">Онлайн</td></tr>`
      : `<tr><td style="padding:4px 0;color:#666;">Место:</td><td style="padding:4px 0;">${escapeHtml(p.location)}</td></tr>`
    : ''

  const timeDisplay = p.timeStr + (p.endTimeStr ? ` — ${p.endTimeStr}` : '')

  const logoHtml = p.orgLogo
    ? `<img src="${p.orgLogo}" alt="${escapeHtml(p.orgName)}" width="40" height="40" style="border-radius:8px;margin-right:12px;vertical-align:middle;" />`
    : ''

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb;margin:0;padding:0;">
  <div style="max-width:520px;margin:0 auto;padding:24px;">
    <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <!-- Header -->
      <div style="background:#10b981;padding:24px;text-align:center;">
        <div style="font-size:36px;margin-bottom:8px;">✅</div>
        <h1 style="color:#fff;font-size:20px;margin:0;">Вы зарегистрированы!</h1>
      </div>

      <!-- Body -->
      <div style="padding:24px;">
        <p style="color:#374151;font-size:15px;margin:0 0 16px;">
          ${escapeHtml(p.participantName)}, вы успешно зарегистрированы на мероприятие:
        </p>

        <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin-bottom:16px;">
          <h2 style="color:#111827;font-size:17px;margin:0 0 12px;">${escapeHtml(p.eventTitle)}</h2>
          <table style="font-size:14px;color:#374151;border-collapse:collapse;width:100%;">
            <tr>
              <td style="padding:4px 0;color:#666;">Дата:</td>
              <td style="padding:4px 0;">${p.dateStr}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#666;">Время:</td>
              <td style="padding:4px 0;">${timeDisplay}</td>
            </tr>
            ${locationHtml}
          </table>
        </div>

        ${qrImageTag}

        <div style="text-align:center;margin:20px 0;">
          <a href="${p.eventUrl}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">
            Подробнее о событии
          </a>
        </div>
      </div>

      <!-- Footer -->
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

  const subject = `Регистрация: ${p.eventTitle}`
  try {
    await emailService.sendEmail({ to: p.email, subject, html })
    logger.info({ to: p.email, has_qr: p.hasQr, event: p.eventTitle }, 'Registration email sent')
  } catch (err: any) {
    logger.error({ to: p.email, error: err?.message, stack: err?.stack }, 'Failed to send registration confirmation email')
  }
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
