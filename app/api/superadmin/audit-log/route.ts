import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

const supabaseAdmin = createAdminServer();

export const dynamic = 'force-dynamic';

/**
 * Verify that the current user is a superadmin
 * ⚡ ОБНОВЛЕНО: Использует unified auth для поддержки OAuth
 */
async function verifySuperadmin(): Promise<{ authorized: boolean; userId?: string; error?: string }> {
  try {
    // Используем unified auth для поддержки OAuth
    const user = await getUnifiedUser();
    
    if (!user) {
      return { authorized: false, error: 'Unauthorized' };
    }
    
    // Check superadmin status
    const { data: superadmin, error: saError } = await supabaseAdmin
      .from('superadmins')
      .select('id')
      .eq('user_id', user.id)
      .single();
    
    if (saError || !superadmin) {
      return { authorized: false, userId: user.id, error: 'Access denied: not a superadmin' };
    }
    
    return { authorized: true, userId: user.id };
  } catch (e) {
    return { authorized: false, error: 'Authentication failed' };
  }
}

/**
 * GET /api/superadmin/audit-log
 * 
 * Fetch admin action logs with optional filters
 * 
 * Query params:
 * - org_id: UUID (optional filter by organization)
 * - user_id: UUID (optional filter by user)
 * - action: string (optional filter by action type)
 * - resource_type: string (optional filter)
 * - hours: number (default: 24)
 * - limit: number (default: 100)
 */
export async function GET(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'superadmin/audit-log' });
  
  try {
    // ✅ Superadmin authentication check
    const auth = await verifySuperadmin();
    if (!auth.authorized) {
      logger.warn({ error: auth.error }, 'Unauthorized access attempt');
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }
    
    const url = new URL(req.url);
    const orgId = url.searchParams.get('org_id');
    const userId = url.searchParams.get('user_id');
    const action = url.searchParams.get('action');
    const resourceType = url.searchParams.get('resource_type');
    const hours = parseInt(url.searchParams.get('hours') || '24', 10);
    const limit = parseInt(url.searchParams.get('limit') || '100', 10);
    
    logger.debug({ hours, limit }, 'Fetching audit logs');
    
    // Calculate time threshold
    const timeThreshold = new Date();
    timeThreshold.setHours(timeThreshold.getHours() - hours);
    
    // Build query (without joins - we'll enrich separately)
    let query = supabaseAdmin
      .from('admin_action_log')
      .select('*')
      .gte('created_at', timeThreshold.toISOString())
      .order('created_at', { ascending: false })
      .limit(limit);
    
    // Apply filters
    if (orgId) {
      query = query.eq('org_id', orgId);
    }
    
    if (userId) {
      query = query.eq('user_id', userId);
    }
    
    if (action) {
      query = query.eq('action', action);
    }
    
    if (resourceType) {
      query = query.eq('resource_type', resourceType);
    }
    
    const { data: logs, error } = await query;
    
    if (error) {
      logger.error({ error }, 'Failed to fetch audit logs');
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    // Enrich logs with user emails and org names
    if (logs && logs.length > 0) {
      // Get unique user IDs and org IDs
      const userIds = Array.from(new Set(logs.map(l => l.user_id).filter(Boolean)));
      const orgIds = Array.from(new Set(logs.map(l => l.org_id).filter(Boolean)));
      
      // Fetch users from local users table
      const { data: users } = await supabaseAdmin
        .from('users')
        .select('id, email')
        .in('id', userIds);
      const userMap = new Map(
        (users || []).map(u => [u.id, u.email])
      );
      
      // Fetch organizations
      const { data: orgs } = await supabaseAdmin
        .from('organizations')
        .select('id, name')
        .in('id', orgIds);
      const orgMap = new Map(
        (orgs || []).map(o => [o.id, o.name])
      );
      
      // Enrich logs
      logs.forEach(log => {
        (log as any).users = { email: userMap.get(log.user_id) || null };
        (log as any).organizations = { name: orgMap.get(log.org_id) || null };
      });
    }
    
    // Get statistics
    const { data: stats } = await supabaseAdmin
      .from('admin_action_log')
      .select('action, resource_type')
      .gte('created_at', timeThreshold.toISOString());
    
    // Count by action type
    const actionCounts: Record<string, number> = {};
    const resourceCounts: Record<string, number> = {};
    
    stats?.forEach(s => {
      actionCounts[s.action] = (actionCounts[s.action] || 0) + 1;
      resourceCounts[s.resource_type] = (resourceCounts[s.resource_type] || 0) + 1;
    });
    
    const statistics = {
      total: stats?.length || 0,
      by_action: actionCounts,
      by_resource: resourceCounts,
    };
    
    logger.debug({ logsCount: logs?.length || 0 }, 'Audit logs fetched');
    
    return NextResponse.json({
      ok: true,
      logs: logs || [],
      statistics,
      filters: {
        org_id: orgId,
        user_id: userId,
        action,
        resource_type: resourceType,
        hours,
        limit
      }
    });
  } catch (error) {
    logger.error({ error }, 'Unexpected error fetching audit logs');
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

