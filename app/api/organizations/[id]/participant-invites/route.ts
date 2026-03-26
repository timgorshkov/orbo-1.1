/**
 * GET  /api/organizations/[id]/participant-invites — list email invites
 * POST /api/organizations/[id]/participant-invites — create single email invite
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getEmailService } from '@/lib/services/emailService'
import { buildParticipantInviteEmail } from '@/lib/services/email/participantInviteTemplate'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orgId } = await params
  const logger = createAPILogger(req, { endpoint: '/api/organizations/[id]/participant-invites GET' })
  const db = createAdminServer()

  const user = await getUnifiedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await getEffectiveOrgRole(user.id, orgId)
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { data: invites } = await db
      .from('participant_email_invites')
      .select('id, email, status, personal_note, expires_at, accepted_at, created_at, participant_id')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })

    return NextResponse.json({ invites: invites || [] })
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to list participant invites')
    return NextResponse.json({ error: 'Внутренняя ошибка' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orgId } = await params
  const logger = createAPILogger(req, { endpoint: '/api/organizations/[id]/participant-invites POST' })
  const db = createAdminServer()

  const user = await getUnifiedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await getEffectiveOrgRole(user.id, orgId)
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { email, personalNote } = await req.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email обязателен' }, { status: 400 })
    }
    const normalizedEmail = email.trim().toLowerCase()

    // Check for active pending invite
    const { data: existing } = await db
      .from('participant_email_invites')
      .select('id, token')
      .eq('org_id', orgId)
      .eq('email', normalizedEmail)
      .eq('status', 'pending')
      .single()

    if (existing) {
      // Resend existing invite
      const inviteLink = `${APP_URL}/p/${orgId}/join/email/${existing.token}`
      const { data: org } = await db
        .from('organizations')
        .select('name, logo_url, portal_cover_url, public_description')
        .eq('id', orgId)
        .single()

      if (org) {
        const { subject, html } = buildParticipantInviteEmail({
          org,
          inviteLink,
          personalNote: personalNote || undefined,
        })
        await getEmailService().sendEmail({ to: normalizedEmail, subject, html })
      }

      return NextResponse.json({ invite: existing, resent: true })
    }

    // Create new invite
    const { data: invite, error } = await db
      .from('participant_email_invites')
      .insert({
        org_id: orgId,
        email: normalizedEmail,
        invited_by: user.id,
        personal_note: personalNote || null,
      })
      .select('id, token, email, status, expires_at, created_at')
      .single()

    if (error || !invite) {
      logger.error({ error: error?.message }, 'Failed to create invite')
      return NextResponse.json({ error: 'Ошибка создания приглашения' }, { status: 500 })
    }

    // Send email
    const { data: org } = await db
      .from('organizations')
      .select('name, logo_url, portal_cover_url, public_description')
      .eq('id', orgId)
      .single()

    if (org) {
      const inviteLink = `${APP_URL}/p/${orgId}/join/email/${invite.token}`
      const { data: userInfo } = await db
        .from('users')
        .select('name')
        .eq('id', user.id)
        .single()

      const { subject, html } = buildParticipantInviteEmail({
        org,
        inviteLink,
        invitedByName: userInfo?.name || undefined,
        personalNote: personalNote || undefined,
      })
      await getEmailService().sendEmail({ to: normalizedEmail, subject, html })
    }

    logger.info({ invite_id: invite.id, email: normalizedEmail, org_id: orgId }, 'Participant invite created')

    return NextResponse.json({ invite })
  } catch (err: any) {
    logger.error({ error: err.message, stack: err.stack }, 'Error creating participant invite')
    return NextResponse.json({ error: 'Внутренняя ошибка' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orgId } = await params
  const logger = createAPILogger(req, { endpoint: '/api/organizations/[id]/participant-invites DELETE' })
  const db = createAdminServer()

  const user = await getUnifiedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await getEffectiveOrgRole(user.id, orgId)
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { inviteId } = await req.json()
    await db
      .from('participant_email_invites')
      .update({ status: 'cancelled' })
      .eq('id', inviteId)
      .eq('org_id', orgId)
      .eq('status', 'pending')

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    logger.error({ error: err.message }, 'Error cancelling invite')
    return NextResponse.json({ error: 'Внутренняя ошибка' }, { status: 500 })
  }
}
