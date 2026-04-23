/**
 * API: Registrator management
 *
 * GET  — list active registrators + invite link status
 * POST — create/regenerate invite link
 * DELETE — deactivate invite link (revokes all sessions)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'
import crypto from 'crypto'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orgId } = await params
  const logger = createAPILogger(request, { endpoint: '/api/organizations/[id]/registrators' })
  try {
    const user = await getUnifiedUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const access = await getEffectiveOrgRole(user.id, orgId)
    if (!access || !['owner', 'admin'].includes(access.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const db = createAdminServer()

    const [inviteResult, sessionsResult] = await Promise.all([
      db.from('registrator_invites')
        .select('id, token, is_active, created_at')
        .eq('org_id', orgId)
        .maybeSingle(),
      db.from('registrator_sessions')
        .select('id, name, is_active, activated_at, last_used_at')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .order('activated_at', { ascending: false }),
    ])

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru'
    const invite = inviteResult.data
    const inviteUrl = invite?.is_active ? `${baseUrl}/r/${invite.token}` : null

    return NextResponse.json({
      invite: invite ? {
        id: invite.id,
        isActive: invite.is_active,
        url: inviteUrl,
        createdAt: invite.created_at,
      } : null,
      registrators: sessionsResult.data || [],
    })
  } catch (error: any) {
    logger.error({ error: error.message, org_id: orgId }, 'Error fetching registrators')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orgId } = await params
  const logger = createAPILogger(request, { endpoint: '/api/organizations/[id]/registrators' })
  try {
    const user = await getUnifiedUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const access = await getEffectiveOrgRole(user.id, orgId)
    if (!access || !['owner', 'admin'].includes(access.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const db = createAdminServer()
    const token = crypto.randomBytes(16).toString('base64url')

    // Deactivate old invite + its sessions
    const { data: oldInvite } = await db
      .from('registrator_invites')
      .select('id')
      .eq('org_id', orgId)
      .maybeSingle()

    if (oldInvite) {
      await Promise.all([
        db.from('registrator_sessions').update({ is_active: false }).eq('invite_id', oldInvite.id),
        db.from('registrator_invites').delete().eq('id', oldInvite.id),
      ])
    }

    // Create new invite
    const { data: invite, error } = await db
      .from('registrator_invites')
      .insert({ org_id: orgId, token, created_by: user.id })
      .select('id, token, created_at')
      .single()

    if (error) {
      logger.error({ error: error.message }, 'Failed to create registrator invite')
      return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru'

    logger.info({ org_id: orgId, invite_id: invite.id }, 'Registrator invite created')
    return NextResponse.json({
      invite: {
        id: invite.id,
        isActive: true,
        url: `${baseUrl}/r/${invite.token}`,
        createdAt: invite.created_at,
      },
    })
  } catch (error: any) {
    logger.error({ error: error.message, org_id: orgId }, 'Error creating registrator invite')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orgId } = await params
  const logger = createAPILogger(request, { endpoint: '/api/organizations/[id]/registrators' })
  try {
    const user = await getUnifiedUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const access = await getEffectiveOrgRole(user.id, orgId)
    if (!access || !['owner', 'admin'].includes(access.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const db = createAdminServer()

    // Deactivate invite + all sessions
    const { data: invite } = await db
      .from('registrator_invites')
      .select('id')
      .eq('org_id', orgId)
      .maybeSingle()

    if (invite) {
      await Promise.all([
        db.from('registrator_sessions').update({ is_active: false }).eq('invite_id', invite.id),
        db.from('registrator_invites').update({ is_active: false }).eq('id', invite.id),
      ])
    }

    logger.info({ org_id: orgId }, 'Registrator invite deactivated')
    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error({ error: error.message, org_id: orgId }, 'Error deactivating registrator invite')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
