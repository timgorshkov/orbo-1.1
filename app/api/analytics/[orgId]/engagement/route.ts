import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const logger = createAPILogger(req, { endpoint: '/api/analytics/[orgId]/engagement' });
  let orgId: string | undefined;
  try {
    const paramsData = await params;
    orgId = paramsData.orgId;

    // Check authentication via unified auth
    const user = await getUnifiedUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminSupabase = createAdminServer();

    // Check org membership
    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Call RPC function
    const { data, error } = await adminSupabase.rpc('get_engagement_breakdown', {
      p_org_id: orgId
    });

    if (error) {
      logger.error({ 
        error: error.message,
        org_id: orgId
      }, 'Error fetching engagement');
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Add cache headers - data is user-specific but can be cached briefly
    return NextResponse.json({ data }, {
      headers: {
        'Cache-Control': 'private, max-age=60, stale-while-revalidate=120'
      }
    });
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      org_id: orgId || 'unknown'
    }, 'Engagement error');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

