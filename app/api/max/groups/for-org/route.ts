import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';
import { getEffectiveOrgRole } from '@/lib/server/orgAccess';

/**
 * GET /api/max/groups/for-org?orgId=...
 * Returns MAX groups linked to an organization.
 */
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/max/groups/for-org' });

  try {
    const orgId = request.nextUrl.searchParams.get('orgId');
    if (!orgId) {
      return NextResponse.json({ error: 'orgId required' }, { status: 400 });
    }

    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orgRole = await getEffectiveOrgRole(user.id, orgId);
    if (!orgRole) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const adminSupabase = createAdminServer();

    // Get linked MAX groups
    const { data: orgLinks } = await adminSupabase
      .from('org_max_groups')
      .select('max_chat_id')
      .eq('org_id', orgId)
      .eq('status', 'active');

    if (!orgLinks || orgLinks.length === 0) {
      return NextResponse.json({ groups: [] });
    }

    const chatIds = orgLinks.map(l => l.max_chat_id);

    const { data: maxGroups } = await adminSupabase
      .from('max_groups')
      .select('max_chat_id, title, bot_status, member_count')
      .in('max_chat_id', chatIds)
      .eq('bot_status', 'connected');

    return NextResponse.json({ groups: maxGroups || [] });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error fetching MAX groups for org');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
