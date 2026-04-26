/**
 * GET /api/registrator/invite-info?token=XXX
 *
 * Public endpoint used by /r/[token] to render the invite acceptance page.
 * Returns the org name for the link, plus info about any existing registrator
 * session in the user's cookie jar (so the page can offer a "Continue" path
 * instead of asking for the name again on revisit).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { getRegistratorSession } from '@/lib/registrator-auth/session'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  const db = createAdminServer()
  const { data: invite } = await db
    .from('registrator_invites')
    .select('id, org_id, is_active')
    .eq('token', token)
    .maybeSingle()

  if (!invite) {
    return NextResponse.json({ error: 'Invalid invite' }, { status: 404 })
  }

  const { data: org } = await db
    .from('organizations')
    .select('id, name')
    .eq('id', invite.org_id)
    .single()

  // Check if the visitor already has an active session for this same org
  const session = await getRegistratorSession()
  const hasMatchingSession = !!(session && session.orgId === invite.org_id)

  return NextResponse.json({
    orgId: invite.org_id,
    orgName: org?.name || '',
    isActive: invite.is_active,
    existingSession: hasMatchingSession
      ? { name: session!.name, orgName: org?.name || '' }
      : null,
  })
}
