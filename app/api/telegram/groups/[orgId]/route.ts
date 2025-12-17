import { NextResponse } from 'next/server';
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer';
import { getOrgTelegramGroups } from '@/lib/server/getOrgTelegramGroups';
import { createAPILogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { orgId: string } }
) {
  const logger = createAPILogger(request, { endpoint: '/api/telegram/groups/[orgId]' });
  try {
    const orgId = params.orgId;

    if (!orgId) {
      return NextResponse.json({ error: 'Missing orgId parameter' }, { status: 400 });
    }

    logger.info({ org_id: orgId }, 'Fetching groups for org');

    const supabase = await createClientServer();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = createAdminServer();

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError) {
      logger.error({ error: membershipError.message, org_id: orgId, user_id: user.id }, 'Membership check error');
      return NextResponse.json({ error: 'Failed to verify membership' }, { status: 500 });
    }

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const groups = await getOrgTelegramGroups(orgId);

    return NextResponse.json({ groups });
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      org_id: params.orgId
    }, 'Error in telegram groups GET');
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

