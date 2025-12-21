import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createServiceLogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

const logger = createServiceLogger('ParticipantTags');

export const dynamic = 'force-dynamic';

/**
 * GET /api/participants/[participantId]/tags
 * Get all tags assigned to a participant
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ participantId: string }> }
) {
  try {
    const { participantId } = await params;
    const adminSupabase = createAdminServer();

    // Check authentication via unified auth
    const user = await getUnifiedUser();

    if (!user) {
      logger.error({}, 'Authentication failed');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get participant's org_id
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
    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', participant.org_id)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      logger.warn({ userId: user.id, participantId }, 'Insufficient permissions to view participant tags');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get tags using helper function
    const { data: tags, error: tagsError } = await adminSupabase
      .rpc('get_participant_tags', { p_participant_id: participantId });

    if (tagsError) {
      logger.error({ error: tagsError, participantId }, 'Failed to fetch participant tags');
      return NextResponse.json({ error: 'Failed to fetch tags' }, { status: 500 });
    }

    logger.info({ participantId, tagCount: tags?.length || 0 }, 'Participant tags fetched successfully');

    return NextResponse.json({
      tags: tags || [],
      total: tags?.length || 0,
    });
  } catch (error) {
    logger.error({ error }, 'Unexpected error fetching participant tags');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/participants/[participantId]/tags
 * Assign a tag to a participant
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ participantId: string }> }
) {
  try {
    const { participantId } = await params;
    const body = await request.json();
    const { tag_id } = body;

    // Validation
    if (!tag_id || typeof tag_id !== 'string') {
      return NextResponse.json({ error: 'tag_id is required' }, { status: 400 });
    }

    const adminSupabase = createAdminServer();

    // Check authentication via unified auth
    const user = await getUnifiedUser();

    if (!user) {
      logger.error({}, 'Authentication failed');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get participant's org_id
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
    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', participant.org_id)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      logger.warn({ userId: user.id, participantId }, 'Insufficient permissions to assign tag');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify tag exists and belongs to same org
    const { data: tag, error: tagError } = await adminSupabase
      .from('participant_tags')
      .select('id, name, org_id')
      .eq('id', tag_id)
      .single();

    if (tagError || !tag) {
      logger.error({ error: tagError, tagId: tag_id }, 'Tag not found');
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }

    if (tag.org_id !== participant.org_id) {
      logger.warn({ tagId: tag_id, tagOrgId: tag.org_id, participantOrgId: participant.org_id }, 'Tag and participant belong to different organizations');
      return NextResponse.json({ error: 'Tag and participant must belong to same organization' }, { status: 400 });
    }

    // Assign tag
    const { data: assignment, error: assignError } = await adminSupabase
      .from('participant_tag_assignments')
      .insert({
        participant_id: participantId,
        tag_id: tag_id,
        assigned_by: user.id,
      })
      .select()
      .single();

    if (assignError) {
      // Check for duplicate assignment
      if (assignError.code === '23505') {
        logger.warn({ participantId, tagId: tag_id }, 'Tag already assigned to participant');
        return NextResponse.json({ error: 'Tag is already assigned to this participant' }, { status: 409 });
      }

      logger.error({ error: assignError, participantId, tagId: tag_id }, 'Failed to assign tag');
      return NextResponse.json({ error: 'Failed to assign tag' }, { status: 500 });
    }

    logger.info({ participantId, tagId: tag_id, tagName: tag.name }, 'Tag assigned successfully');

    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    logger.error({ error }, 'Unexpected error assigning tag');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

