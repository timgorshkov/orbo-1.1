import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { getEffectiveOrgRole } from '@/lib/server/orgAccess';
import { getUnifiedUser } from '@/lib/auth/unified-auth';
import { createAPILogger } from '@/lib/logger';

export interface AnnouncementDefaults {
  target_groups: number[];
  target_topics: Record<string, number>;
  target_max_groups: number[];
}

// GET /api/announcements/defaults?org_id=...
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: 'announcements-defaults' });
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get('org_id');

  if (!orgId) {
    return NextResponse.json({ error: 'org_id required' }, { status: 400 });
  }

  const user = await getUnifiedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const role = await getEffectiveOrgRole(user.id, orgId);
  if (!role || !['owner', 'admin'].includes(role.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = createAdminServer();
  const { data, error } = await db
    .from('organizations')
    .select('announcement_defaults')
    .eq('id', orgId)
    .single();

  if (error) {
    logger.error({ orgId, error: error.message }, 'Failed to fetch announcement defaults');
    return NextResponse.json({ error: 'Failed to fetch defaults' }, { status: 500 });
  }

  const defaults: AnnouncementDefaults = {
    target_groups: [],
    target_topics: {},
    target_max_groups: [],
    ...(data?.announcement_defaults ?? {}),
  };

  return NextResponse.json({ defaults });
}

// PATCH /api/announcements/defaults
export async function PATCH(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: 'announcements-defaults' });
  const user = await getUnifiedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { org_id, target_groups, target_topics, target_max_groups } = body;

  if (!org_id) {
    return NextResponse.json({ error: 'org_id required' }, { status: 400 });
  }

  const role = await getEffectiveOrgRole(user.id, org_id);
  if (!role || !['owner', 'admin'].includes(role.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const defaults: AnnouncementDefaults = {
    target_groups: Array.isArray(target_groups) ? target_groups.map(Number) : [],
    target_topics: (target_topics && typeof target_topics === 'object' && !Array.isArray(target_topics))
      ? target_topics
      : {},
    target_max_groups: Array.isArray(target_max_groups) ? target_max_groups.map(Number) : [],
  };

  const db = createAdminServer();
  const { error } = await db
    .from('organizations')
    .update({ announcement_defaults: defaults })
    .eq('id', org_id);

  if (error) {
    logger.error({ org_id, error: error.message }, 'Failed to update announcement defaults');
    return NextResponse.json({ error: 'Failed to update defaults' }, { status: 500 });
  }

  logger.info({ org_id }, 'Announcement defaults updated');
  return NextResponse.json({ defaults });
}
