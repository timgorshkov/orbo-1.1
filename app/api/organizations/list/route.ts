import { NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const logger = createAPILogger(request, { endpoint: '/api/organizations/list' });
  try {
    const user = await getUnifiedUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = createAdminServer();

    const { data: memberships, error: membershipsError } = await supabaseAdmin
      .from('memberships')
      .select('org_id, role, organizations(id, name, plan)')
      .eq('user_id', user.id);

    if (membershipsError) {
      logger.error({ 
        error: membershipsError.message,
        user_id: user.id
      }, 'Error fetching memberships');
      return NextResponse.json({ error: 'Failed to fetch organizations' }, { status: 500 });
    }

    const orgs = memberships?.map((item: any) => ({
      id: item.org_id,
      name: item.organizations?.name || 'Организация',
      plan: item.organizations?.plan || 'free',
      role: item.role,
    })) || [];

    logger.info({ 
      org_count: orgs.length,
      user_id: user.id
    }, 'Fetched organizations list');
    return NextResponse.json({ organizations: orgs });
  } catch (error: any) {
    logger.error({ 
      error: error?.message || String(error),
      stack: error?.stack
    }, 'Error in organizations list API');
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}

