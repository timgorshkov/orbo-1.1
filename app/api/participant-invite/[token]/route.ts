/**
 * POST /api/participant-invite/[token]/accept
 * Accept a participant email invite: verify token, create/find participant, set session cookie.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { createParticipantToken } from '@/lib/participant-auth/session'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const logger = createAPILogger(req, { endpoint: '/api/participant-invite/[token]' })
  const db = createAdminServer()

  try {
    // 1. Find invite
    const { data: invite, error: inviteError } = await db
      .from('participant_email_invites')
      .select('id, org_id, email, status, expires_at, participant_id')
      .eq('token', token)
      .single()

    if (inviteError || !invite) {
      return NextResponse.json({ error: 'Приглашение не найдено' }, { status: 404 })
    }
    if (invite.status !== 'pending') {
      return NextResponse.json({ error: 'Приглашение уже использовано или отменено' }, { status: 410 })
    }
    if (new Date(invite.expires_at) < new Date()) {
      await db.from('participant_email_invites').update({ status: 'expired' }).eq('id', invite.id)
      return NextResponse.json({ error: 'Приглашение истекло' }, { status: 410 })
    }

    // 2. Find or create participant
    let participantId = invite.participant_id as string | null

    if (!participantId) {
      // Check if participant with this email exists in org
      const { data: existing } = await db
        .from('participants')
        .select('id')
        .eq('org_id', invite.org_id)
        .eq('email', invite.email)
        .is('merged_into', null)
        .single()

      if (existing) {
        participantId = existing.id
      } else {
        // Create new participant
        const { data: created, error: createError } = await db
          .from('participants')
          .insert({
            org_id: invite.org_id,
            email: invite.email,
            invite_source: 'email_invite',
            email_verified_at: new Date().toISOString(),
          })
          .select('id')
          .single()

        if (createError || !created) {
          logger.error({ error: createError?.message, org_id: invite.org_id }, 'Failed to create participant')
          return NextResponse.json({ error: 'Ошибка создания профиля' }, { status: 500 })
        }
        participantId = created.id
      }
    } else {
      // Mark email verified if not yet
      await db
        .from('participants')
        .update({ email_verified_at: new Date().toISOString() })
        .eq('id', participantId)
        .is('email_verified_at', null)
    }

    // 3. Mark invite as accepted
    await db
      .from('participant_email_invites')
      .update({ status: 'accepted', accepted_at: new Date().toISOString(), participant_id: participantId })
      .eq('id', invite.id)

    if (!participantId) {
      return NextResponse.json({ error: 'Ошибка создания профиля' }, { status: 500 })
    }

    // 4. Set session cookie directly on the response (cookies().set() from next/headers
    //    is not reliably merged into NextResponse.json() — set it explicitly instead)
    const sessionToken = createParticipantToken({
      participantId,
      orgId: invite.org_id,
      email: invite.email,
    })

    logger.info({ invite_id: invite.id, participant_id: participantId, org_id: invite.org_id }, 'Invite accepted')

    const response = NextResponse.json({ ok: true, participantId, orgId: invite.org_id })
    response.cookies.set('participant_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    })
    return response
  } catch (err: any) {
    logger.error({ error: err.message, stack: err.stack }, 'Error accepting invite')
    return NextResponse.json({ error: 'Внутренняя ошибка' }, { status: 500 })
  }
}
