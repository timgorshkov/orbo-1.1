import { NextRequest, NextResponse } from 'next/server';
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/participants/[participantId]/tags/[tagId]
 * Remove a tag from a participant
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ participantId: string; tagId: string }> }
) {
  try {
    const { participantId, tagId } = await params;

    // Check authentication
    const supabase = await createClientServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      logger.error({ error: authError }, 'Authentication failed');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get participant's org_id
    const adminSupabase = createAdminServer();
    const { data: participant, error: participantError } = await adminSupabase
      .from('participants')
      .select('org_id')
      .eq('id', participantId)
      .single();

    if (participantError || !participant) {
      logger.error({ error: participantError, participantId }, 'Participant not found');
      return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
    }

    // Check admin permissions
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', participant.org_id)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      logger.warn({ userId: user.id, participantId }, 'Insufficient permissions to remove tag');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get tag name before deletion (for logging)
    const { data: tag } = await adminSupabase
      .from('participant_tags')
      .select('name')
      .eq('id', tagId)
      .single();

    // Remove tag assignment
    const { error: deleteError } = await adminSupabase
      .from('participant_tag_assignments')
      .delete()
      .eq('participant_id', participantId)
      .eq('tag_id', tagId);

    if (deleteError) {
      logger.error({ error: deleteError, participantId, tagId }, 'Failed to remove tag');
      return NextResponse.json({ error: 'Failed to remove tag' }, { status: 500 });
    }

    logger.info({ participantId, tagId, tagName: tag?.name }, 'Tag removed successfully');

    return NextResponse.json({ success: true, message: 'Tag removed successfully' });
  } catch (error) {
    logger.error({ error }, 'Unexpected error removing tag');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

