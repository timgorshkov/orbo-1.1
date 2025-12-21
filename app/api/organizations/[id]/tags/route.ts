import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createServiceLogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

const logger = createServiceLogger('OrganizationTags');

export const dynamic = 'force-dynamic';

// Predefined color palette (not exported - used internally and in [tagId]/route.ts)
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
 * GET /api/organizations/[id]/tags
 * Get all tags for an organization (with usage stats)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orgId } = await params;
    const adminSupabase = createAdminServer();

    // Check authentication via unified auth
    const user = await getUnifiedUser();

    if (!user) {
      logger.error({}, 'Authentication failed');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin permissions
    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      logger.warn({ userId: user.id, orgId }, 'Insufficient permissions to view tags');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get tags with usage stats
    const { data: tagStats, error: statsError } = await adminSupabase
      .rpc('get_tag_stats', { p_org_id: orgId });

    if (statsError) {
      logger.error({ error: statsError, orgId }, 'Failed to fetch tag stats');
      return NextResponse.json({ error: 'Failed to fetch tags' }, { status: 500 });
    }

    logger.info({ orgId, tagCount: tagStats?.length || 0 }, 'Tags fetched successfully');

    return NextResponse.json({
      tags: tagStats || [],
      total: tagStats?.length || 0,
    });
  } catch (error) {
    logger.error({ error }, 'Unexpected error fetching tags');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/organizations/[id]/tags
 * Create a new tag
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orgId } = await params;
    const body = await request.json();
    const { name, color, description } = body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Tag name is required' }, { status: 400 });
    }

    if (name.trim().length > 50) {
      return NextResponse.json({ error: 'Tag name must be 50 characters or less' }, { status: 400 });
    }

    if (!color || typeof color !== 'string') {
      return NextResponse.json({ error: 'Tag color is required' }, { status: 400 });
    }

    // Validate color is in predefined palette
    const validColors = TAG_COLORS.map(c => c.value);
    if (!validColors.includes(color)) {
      return NextResponse.json({ error: 'Invalid color. Please use a predefined color.' }, { status: 400 });
    }

    if (description && typeof description === 'string' && description.length > 200) {
      return NextResponse.json({ error: 'Description must be 200 characters or less' }, { status: 400 });
    }

    const adminSupabase = createAdminServer();

    // Check authentication via unified auth
    const user = await getUnifiedUser();

    if (!user) {
      logger.error({}, 'Authentication failed');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin permissions
    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      logger.warn({ userId: user.id, orgId }, 'Insufficient permissions to create tag');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Create tag
    const { data: newTag, error: createError } = await adminSupabase
      .from('participant_tags')
      .insert({
        org_id: orgId,
        name: name.trim(),
        color: color,
        description: description?.trim() || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (createError) {
      // Check for unique constraint violation
      if (createError.code === '23505') {
        logger.warn({ orgId, name }, 'Tag name already exists');
        return NextResponse.json({ error: 'A tag with this name already exists' }, { status: 409 });
      }

      logger.error({ error: createError, orgId, name }, 'Failed to create tag');
      return NextResponse.json({ error: 'Failed to create tag' }, { status: 500 });
    }

    logger.info({ orgId, tagId: newTag.id, name: newTag.name }, 'Tag created successfully');

    return NextResponse.json({ tag: newTag }, { status: 201 });
  } catch (error) {
    logger.error({ error }, 'Unexpected error creating tag');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

