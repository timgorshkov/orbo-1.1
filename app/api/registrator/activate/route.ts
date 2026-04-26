/**
 * API: Activate registrator session
 * POST { token, name } → sets cookie, returns org info
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { setRegistratorCookie, getRegistratorSession } from '@/lib/registrator-auth/session'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/registrator/activate' })
  try {
    const { token, name } = await request.json()

    if (!token || !name?.trim()) {
      return NextResponse.json({ error: 'Token and name are required' }, { status: 400 })
    }

    const db = createAdminServer()

    // Find active invite
    const { data: invite } = await db
      .from('registrator_invites')
      .select('id, org_id')
      .eq('token', token)
      .eq('is_active', true)
      .maybeSingle()

    if (!invite) {
      return NextResponse.json({ error: 'Ссылка недействительна или деактивирована' }, { status: 404 })
    }

    // Get org name for the UI
    const { data: org } = await db
      .from('organizations')
      .select('name, logo_url')
      .eq('id', invite.org_id)
      .single()

    // If the visitor already has an active session for this same org, keep it.
    // (This shouldn't normally hit because /r/[token] page checks via invite-info
    // and offers a "Continue" button, but treat it as an idempotent activation.)
    const existing = await getRegistratorSession()
    if (existing && existing.orgId === invite.org_id) {
      logger.info({ org_id: invite.org_id, session_id: existing.sessionId }, 'Registrator already active, reusing')
      return NextResponse.json({
        success: true,
        orgId: invite.org_id,
        orgName: org?.name || '',
        orgLogo: org?.logo_url || null,
        reused: true,
      })
    }

    // Create session
    const sessionSecret = crypto.randomBytes(32).toString('base64url')
    const { data: session, error } = await db
      .from('registrator_sessions')
      .insert({
        org_id: invite.org_id,
        invite_id: invite.id,
        name: name.trim(),
        session_secret: sessionSecret,
      })
      .select('id')
      .single()

    if (error) {
      logger.error({ error: error.message }, 'Failed to create registrator session')
      return NextResponse.json({ error: 'Failed to activate' }, { status: 500 })
    }

    // Set cookie
    await setRegistratorCookie(sessionSecret)

    logger.info({
      org_id: invite.org_id,
      session_id: session.id,
      name: name.trim(),
    }, 'Registrator session activated')

    return NextResponse.json({
      success: true,
      orgId: invite.org_id,
      orgName: org?.name || '',
      orgLogo: org?.logo_url || null,
    })
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error activating registrator')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
