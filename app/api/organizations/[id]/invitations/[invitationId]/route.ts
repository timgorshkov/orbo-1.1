import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

// DELETE /api/organizations/[id]/invitations/[invitationId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; invitationId: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/organizations/[id]/invitations/[invitationId]' });
  
  try {
    const { id: orgId, invitationId } = await params;
    const adminSupabase = createAdminServer()

    // Check authentication
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check user is owner
    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single()

    if (!membership || membership.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only organization owners can cancel invitations' },
        { status: 403 }
      )
    }

    // Update invitation status to cancelled
    const { error: updateError } = await adminSupabase
      .from('invitations')
      .update({ status: 'cancelled' })
      .eq('id', invitationId)
      .eq('org_id', orgId)

    if (updateError) {
      logger.error({ 
        error: updateError.message,
        invitation_id: invitationId,
        org_id: orgId
      }, 'Error cancelling invitation');
      return NextResponse.json(
        { error: 'Failed to cancel invitation' },
        { status: 500 }
      )
    }

    logger.info({ 
      invitation_id: invitationId,
      org_id: orgId,
      cancelled_by: user.id
    }, 'Invitation cancelled');

    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Error in DELETE invitation');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

