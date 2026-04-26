/**
 * GET /api/registrator/me
 * Returns the current registrator session (name + org) or 401 if no cookie.
 *
 * Used by /checkin and /r/[token] to render the actor name in the header
 * and decide whether to skip the name-entry step on revisit.
 */

import { NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { getRegistratorSession } from '@/lib/registrator-auth/session'

export async function GET() {
  const session = await getRegistratorSession()
  if (!session) {
    return NextResponse.json({ session: null }, { status: 200 })
  }

  const db = createAdminServer()
  const { data: org } = await db
    .from('organizations')
    .select('id, name')
    .eq('id', session.orgId)
    .single()

  return NextResponse.json({
    session: {
      sessionId: session.sessionId,
      orgId: session.orgId,
      name: session.name,
      orgName: org?.name || '',
    },
  })
}
