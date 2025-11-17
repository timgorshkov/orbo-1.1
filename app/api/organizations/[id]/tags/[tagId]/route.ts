import { NextRequest, NextResponse } from 'next/server';
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

export const dynamic = 'force-dynamic';

// Predefined color palette (duplicated from parent route to avoid export issues)
const TAG_COLORS = [
  { value: '#3B82F6', label: 'Blue', description: 'General purpose' },
  { value: '#10B981', label: 'Green', description: 'Positive, Active, Paid' },
  { value: '#F59E0B', label: 'Yellow', description: 'Warning, Attention' },
  { value: '#EF4444', label: 'Red', description: 'Urgent, Problem, Risk' },
  { value: '#8B5CF6', label: 'Purple', description: 'VIP, Premium' },
  { value: '#EC4899', label: 'Pink', description: 'Special, Featured' },
  { value: '#6366F1', label: 'Indigo', description: 'Expertise, Mentor' },
  { value: '#6B7280', label: 'Gray', description: 'Neutral, Archived' },
  { value: '#F97316', label: 'Orange', description: 'In Progress, Pipeline' },
  { value: '#14B8A6', label: 'Teal', description: 'Success, Completed' },
];

/**
 * PATCH /api/organizations/[id]/tags/[tagId]
 * Update a tag
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tagId: string }> }
) {
  try {
    const { id: orgId, tagId } = await params;
    const body = await request.json();
    const { name, color, description } = body;

    // Validation
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return NextResponse.json({ error: 'Tag name cannot be empty' }, { status: 400 });
      }
      if (name.trim().length > 50) {
        return NextResponse.json({ error: 'Tag name must be 50 characters or less' }, { status: 400 });
      }
    }

    if (color !== undefined) {
      if (typeof color !== 'string') {
        return NextResponse.json({ error: 'Invalid color format' }, { status: 400 });
      }
      const validColors = TAG_COLORS.map(c => c.value);
      if (!validColors.includes(color)) {
        return NextResponse.json({ error: 'Invalid color. Please use a predefined color.' }, { status: 400 });
      }
    }

    if (description !== undefined && description !== null) {
      if (typeof description === 'string' && description.length > 200) {
        return NextResponse.json({ error: 'Description must be 200 characters or less' }, { status: 400 });
      }
    }

    // Check authentication
    const supabase = await createClientServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      logger.error({ error: authError }, 'Authentication failed');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin permissions
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      logger.warn({ userId: user.id, orgId }, 'Insufficient permissions to update tag');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Build update object
    const updates: any = {};
    if (name !== undefined) updates.name = name.trim();
    if (color !== undefined) updates.color = color;
    if (description !== undefined) updates.description = description?.trim() || null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    // Update tag
    const adminSupabase = createAdminServer();
    const { data: updatedTag, error: updateError } = await adminSupabase
      .from('participant_tags')
      .update(updates)
      .eq('id', tagId)
      .eq('org_id', orgId)
      .select()
      .single();

    if (updateError) {
      // Check for unique constraint violation
      if (updateError.code === '23505') {
        logger.warn({ orgId, tagId, name }, 'Tag name already exists');
        return NextResponse.json({ error: 'A tag with this name already exists' }, { status: 409 });
      }

      logger.error({ error: updateError, orgId, tagId }, 'Failed to update tag');
      return NextResponse.json({ error: 'Failed to update tag' }, { status: 500 });
    }

    if (!updatedTag) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }

    logger.info({ orgId, tagId, updates }, 'Tag updated successfully');

    return NextResponse.json({ tag: updatedTag });
  } catch (error) {
    logger.error({ error }, 'Unexpected error updating tag');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/organizations/[id]/tags/[tagId]
 * Delete a tag (and all its assignments)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tagId: string }> }
) {
  try {
    const { id: orgId, tagId } = await params;

    // Check authentication
    const supabase = await createClientServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      logger.error({ error: authError }, 'Authentication failed');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin permissions
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      logger.warn({ userId: user.id, orgId }, 'Insufficient permissions to delete tag');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get tag info before deletion (for logging)
    const adminSupabase = createAdminServer();
    const { data: tag } = await adminSupabase
      .from('participant_tags')
      .select('name')
      .eq('id', tagId)
      .eq('org_id', orgId)
      .single();

    // Delete tag (assignments will be cascade deleted)
    const { error: deleteError } = await adminSupabase
      .from('participant_tags')
      .delete()
      .eq('id', tagId)
      .eq('org_id', orgId);

    if (deleteError) {
      logger.error({ error: deleteError, orgId, tagId }, 'Failed to delete tag');
      return NextResponse.json({ error: 'Failed to delete tag' }, { status: 500 });
    }

    logger.info({ orgId, tagId, tagName: tag?.name }, 'Tag deleted successfully');

    return NextResponse.json({ success: true, message: 'Tag deleted successfully' });
  } catch (error) {
    logger.error({ error }, 'Unexpected error deleting tag');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

