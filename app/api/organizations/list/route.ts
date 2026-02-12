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

    // Используем raw SQL JOIN вместо Supabase-style join синтаксиса,
    // т.к. PostgresQueryBuilder не поддерживает вложенные joins
    const { data: memberships, error: membershipsError } = await supabaseAdmin.raw(`
      SELECT m.org_id, m.role, o.id AS org_real_id, o.name AS org_name, o.plan AS org_plan
      FROM memberships m
      LEFT JOIN organizations o ON o.id = m.org_id
      WHERE m.user_id = $1
    `, [user.id]);

    if (membershipsError) {
      logger.error({ 
        error: membershipsError.message,
        user_id: user.id
      }, 'Error fetching memberships');
      return NextResponse.json({ error: 'Failed to fetch organizations' }, { status: 500 });
    }

    const orgs = memberships?.map((item: any) => ({
      id: item.org_id,
      name: item.org_name || 'Организация',
      plan: item.org_plan || 'free',
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

