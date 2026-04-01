import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { getParticipantSession } from '@/lib/participant-auth/session'
import { createAPILogger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: 'user/profile/revoke-announcements-consent' })

  try {
    const orgId = new URL(request.url).searchParams.get('orgId')
    if (!orgId) {
      return NextResponse.json({ error: 'orgId required' }, { status: 400 })
    }

    const session = await getParticipantSession()
    if (!session?.participantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminServer()

    // Verify participant belongs to this org
    const { data: participant } = await supabase
      .from('participants')
      .select('id, org_id, announcements_consent_granted_at')
      .eq('id', session.participantId)
      .eq('org_id', orgId)
      .single()

    if (!participant) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (!participant.announcements_consent_granted_at) {
      return NextResponse.json({ error: 'No consent to revoke' }, { status: 400 })
    }

    const { error } = await supabase
      .from('participants')
      .update({ announcements_consent_revoked_at: new Date().toISOString() })
      .eq('id', participant.id)

    if (error) {
      logger.error({ error: error.message, participant_id: participant.id }, 'Failed to revoke consent')
      return NextResponse.json({ error: 'Failed' }, { status: 500 })
    }

    logger.info({ participant_id: participant.id, org_id: orgId }, 'Announcements consent revoked')
    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error({ error: err instanceof Error ? err.message : String(err) }, 'Error revoking consent')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
