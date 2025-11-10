import { createAdminServer } from '@/lib/server/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';
import { createAPILogger } from '@/lib/logger';

// GET /api/superadmin/ai-requests - List all AI requests (superadmin only)
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const logger = createAPILogger(request);

  try {
    const adminSupabase = createAdminServer();
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const requestType = searchParams.get('requestType'); // 'create_app', 'edit_app', 'chat_message'
    const wasApplied = searchParams.get('wasApplied'); // 'true', 'false'
    const userId = searchParams.get('userId');
    const orgId = searchParams.get('orgId');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Check if user is superadmin
    const { data: { user }, error: authError } = await adminSupabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check superadmin status
    const { data: superadminData } = await adminSupabase
      .from('superadmins')
      .select('is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (!superadminData) {
      return NextResponse.json({ error: 'Forbidden: Superadmin only' }, { status: 403 });
    }

    // Build query
    let query = adminSupabase
      .from('ai_requests')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (requestType) {
      query = query.eq('request_type', requestType);
    }
    if (wasApplied !== null) {
      query = query.eq('was_applied', wasApplied === 'true');
    }
    if (userId) {
      query = query.eq('user_id', userId);
    }
    if (orgId) {
      query = query.eq('org_id', orgId);
    }

    const { data: requests, error, count } = await query;

    if (error) {
      logger.error({ error }, 'Failed to fetch AI requests');
      return NextResponse.json(
        { error: 'Failed to fetch AI requests' },
        { status: 500 }
      );
    }

    // Enrich with user emails and org names
    if (requests && requests.length > 0) {
      const userIds = Array.from(new Set(requests.map(r => r.user_id).filter(Boolean)));
      const orgIds = Array.from(new Set(requests.map(r => r.org_id).filter(Boolean)));

      // Fetch users
      const { data: users } = await adminSupabase.auth.admin.listUsers();
      const userMap = new Map(users.users.map(u => [u.id, u.email]));

      // Fetch orgs
      const { data: orgs } = await adminSupabase
        .from('organizations')
        .select('id, name')
        .in('id', orgIds);
      const orgMap = new Map((orgs || []).map(o => [o.id, o.name]));

      // Fetch apps (if applicable)
      const appIds = Array.from(new Set(requests.map(r => r.app_id).filter(Boolean)));
      const { data: apps } = await adminSupabase
        .from('apps')
        .select('id, name')
        .in('id', appIds);
      const appMap = new Map((apps || []).map(a => [a.id, a.name]));

      // Enrich requests
      requests.forEach(req => {
        (req as any).user_email = userMap.get(req.user_id) || 'Unknown';
        (req as any).org_name = req.org_id ? (orgMap.get(req.org_id) || 'Unknown') : null;
        (req as any).app_name = req.app_id ? (appMap.get(req.app_id) || 'Unknown') : null;
      });
    }

    // Calculate stats
    const { data: stats } = await adminSupabase
      .from('ai_requests')
      .select('request_type, was_applied, cost_usd.sum()', { count: 'exact' });

    const totalCost = requests?.reduce((sum, r) => sum + (parseFloat(r.cost_usd) || 0), 0) || 0;
    const appliedCount = requests?.filter(r => r.was_applied).length || 0;

    const duration = Date.now() - startTime;
    logger.info({
      count: requests?.length || 0,
      totalCount: count,
      appliedCount,
      duration,
    }, 'AI requests fetched');

    return NextResponse.json({
      requests: requests || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
      },
      stats: {
        totalCost: totalCost.toFixed(4),
        appliedCount,
        totalCount: count || 0,
      },
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error({ error: error.message, duration }, 'Error in GET /api/superadmin/ai-requests');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

