/**
 * POST /api/participant-auth/email — request magic link for participant login
 * GET  /api/participant-auth/email?token=... — verify magic link, set session, redirect
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { createParticipantToken } from '@/lib/participant-auth/session'
import { sendEmail } from '@/lib/services/email'
import { buildParticipantMagicLinkEmail } from '@/lib/services/email/participantInviteTemplate'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru'

// POST — send magic link
export async function POST(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: '/api/participant-auth/email POST' })
  const db = createAdminServer()

  try {
    const { email, orgId } = await req.json()

    if (!email || !orgId) {
      return NextResponse.json({ error: 'email и orgId обязательны' }, { status: 400 })
    }

    // Find participant by email in org
    const { data: participant } = await db
      .from('participants')
      .select('id, email')
      .eq('org_id', orgId)
      .eq('email', email)
      .is('merged_into', null)
      .single()

    if (!participant) {
      // Return success anyway to avoid email enumeration
      return NextResponse.json({ ok: true })
    }

    // Get org branding
    const { data: org } = await db
      .from('organizations')
      .select('id, name, logo_url, portal_cover_url, public_description')
      .eq('id', orgId)
      .single()

    if (!org) {
      return NextResponse.json({ error: 'Организация не найдена' }, { status: 404 })
    }

    // Create auth token (invalidate recent ones first)
    await db.raw(
      `UPDATE participant_auth_tokens SET used_at = NOW() WHERE participant_id = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [participant.id]
    )

    const { data: authToken } = await db
      .from('participant_auth_tokens')
      .insert({
        participant_id: participant.id,
        email,
        org_id: orgId,
      })
      .select('token')
      .single()

    if (!authToken) {
      return NextResponse.json({ error: 'Ошибка создания ссылки' }, { status: 500 })
    }

    const magicLink = `${APP_URL}/api/participant-auth/email?token=${authToken.token}&redirect=/p/${orgId}`

    const { subject, html } = buildParticipantMagicLinkEmail({ org, magicLink })
    await sendEmail({ to: email, subject, html })

    logger.info({ participant_id: participant.id, org_id: orgId }, 'Magic link sent')

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    logger.error({ error: err.message, stack: err.stack }, 'Error sending magic link')
    return NextResponse.json({ error: 'Внутренняя ошибка' }, { status: 500 })
  }
}

// GET — verify magic link token
export async function GET(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: '/api/participant-auth/email GET' })
  const db = createAdminServer()

  const token = req.nextUrl.searchParams.get('token')
  const redirectTo = req.nextUrl.searchParams.get('redirect') || '/'

  if (!token) {
    return NextResponse.redirect(new URL('/signin', APP_URL))
  }

  try {
    const { data: authToken } = await db
      .from('participant_auth_tokens')
      .select('id, participant_id, email, org_id, expires_at, used_at')
      .eq('token', token)
      .single()

    if (!authToken) {
      return NextResponse.redirect(new URL(`${redirectTo}?auth_error=invalid_token`, APP_URL))
    }
    if (authToken.used_at) {
      return NextResponse.redirect(new URL(`${redirectTo}?auth_error=token_used`, APP_URL))
    }
    if (new Date(authToken.expires_at) < new Date()) {
      return NextResponse.redirect(new URL(`${redirectTo}?auth_error=token_expired`, APP_URL))
    }

    // Mark token as used
    await db
      .from('participant_auth_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', authToken.id)

    // Mark email as verified
    await db
      .from('participants')
      .update({ email_verified_at: new Date().toISOString() })
      .eq('id', authToken.participant_id)
      .is('email_verified_at', null)

    const { data: participant } = await db
      .from('participants')
      .select('full_name, tg_user_id')
      .eq('id', authToken.participant_id)
      .single()

    const sessionToken = createParticipantToken({
      participantId: authToken.participant_id,
      orgId: authToken.org_id,
      email: authToken.email,
      name: participant?.full_name ?? undefined,
      tgUserId: participant?.tg_user_id ?? undefined,
    })

    logger.info({ participant_id: authToken.participant_id, org_id: authToken.org_id }, 'Magic link login success')

    // Return an HTML page that uses fetch() to set the session cookie, then navigates.
    // This is more reliable than setting Set-Cookie on a redirect response — some browsers
    // (and email clients that wrap URLs) can lose cookies set on redirect chains.
    const destination = new URL(redirectTo, APP_URL).toString()
    const html = `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"><title>Вход...</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb;color:#374151}p{font-size:1rem}</style>
</head>
<body>
<p>Выполняем вход…</p>
<script>
fetch('/api/participant-auth/set-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:${JSON.stringify(sessionToken)}})})
  .then(function(r){if(r.ok){window.location.replace(${JSON.stringify(destination)})}else{window.location.replace(${JSON.stringify(destination+'?auth_error=session_error')})}})
  .catch(function(){window.location.replace(${JSON.stringify(destination+'?auth_error=network_error')})});
</script>
</body>
</html>`

    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (err: any) {
    logger.error({ error: err.message, stack: err.stack }, 'Error verifying magic link')
    return NextResponse.redirect(new URL(`${redirectTo}?auth_error=server_error`, APP_URL))
  }
}
