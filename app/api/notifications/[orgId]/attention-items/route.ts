import { NextRequest, NextResponse } from 'next/server';
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';

/**
 * POST /api/notifications/[orgId]/attention-items
 * Sync attention zone items to database for resolution tracking
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/notifications/[orgId]/attention-items' });
  
  try {
    const { orgId } = await params;
    const supabase = await createClientServer();
    const adminSupabase = createAdminServer();
    
    // Проверка авторизации
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Проверка доступа к организации (owner/admin)
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();
    
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    // Get items from request body
    const body = await request.json();
    const { items } = body;
    
    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ error: 'items array required' }, { status: 400 });
    }
    
    // Upsert items to attention_zone_items
    const itemsToUpsert = items.map((item: any) => ({
      org_id: orgId,
      item_type: item.type, // 'churning_participant', 'inactive_newcomer', 'critical_event'
      item_id: item.id,
      item_data: item.data || {},
      last_shown_at: new Date().toISOString(),
    }));
    
    const { error } = await adminSupabase
      .from('attention_zone_items')
      .upsert(itemsToUpsert, {
        onConflict: 'org_id,item_type,item_id',
        ignoreDuplicates: false,
      });
    
    if (error) {
      logger.error({ error: error.message, org_id: orgId }, 'Error syncing attention items');
      return NextResponse.json({ error: 'Failed to sync items' }, { status: 500 });
    }
    
    // Increment times_shown for existing items
    await adminSupabase.rpc('increment_attention_item_shown', {
      p_org_id: orgId,
      p_item_ids: items.map((i: any) => i.id),
    });
    
    logger.info({ org_id: orgId, count: items.length }, 'Attention items synced');
    
    return NextResponse.json({ success: true, count: items.length });
    
  } catch (error) {
    logger.error({ error }, 'Error syncing attention items');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/notifications/[orgId]/attention-items
 * Get attention zone items with pagination and rotation logic
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/notifications/[orgId]/attention-items' });
  
  try {
    const { orgId } = await params;
    const supabase = await createClientServer();
    const adminSupabase = createAdminServer();
    
    // Проверка авторизации
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Проверка доступа к организации (owner/admin)
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();
    
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    // Get query params
    const url = new URL(request.url);
    const type = url.searchParams.get('type');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const includeResolved = url.searchParams.get('includeResolved') === 'true';
    
    // Fetch from RPC functions based on type
    let churningData: any[] = [];
    let newcomersData: any[] = [];
    let eventsData: any[] = [];
    
    if (!type || type === 'churning_participant') {
      const { data } = await adminSupabase.rpc('get_churning_participants', {
        p_org_id: orgId,
        p_days_silent: 14,
      });
      churningData = data || [];
    }
    
    if (!type || type === 'inactive_newcomer') {
      const { data } = await adminSupabase.rpc('get_inactive_newcomers', {
        p_org_id: orgId,
        p_days_since_first: 14,
      });
      newcomersData = data || [];
    }
    
    // Get resolved items to filter
    const { data: resolvedItems } = await adminSupabase
      .from('attention_zone_items')
      .select('item_id, item_type, resolved_at, resolved_by_name')
      .eq('org_id', orgId)
      .not('resolved_at', 'is', null);
    
    const resolvedMap = new Map<string, { resolved_at: string; resolved_by: string }>();
    for (const item of resolvedItems || []) {
      const key = `${item.item_type}:${item.item_id}`;
      resolvedMap.set(key, {
        resolved_at: item.resolved_at,
        resolved_by: item.resolved_by_name,
      });
    }
    
    // Transform and combine
    const allItems: any[] = [];
    
    for (const p of churningData) {
      const key = `churning_participant:${p.participant_id}`;
      const resolved = resolvedMap.get(key);
      if (resolved && !includeResolved) continue;
      
      allItems.push({
        id: p.participant_id,
        type: 'churning_participant',
        title: 'Участник на грани оттока',
        description: p.full_name || p.username || 'Без имени',
        metadata: {
          days_since_activity: p.days_since_activity,
          previous_activity_score: p.previous_activity_score,
        },
        link_url: `/p/${orgId}/members/${p.participant_id}`,
        resolved_at: resolved?.resolved_at || null,
        resolved_by_name: resolved?.resolved_by || null,
      });
    }
    
    for (const p of newcomersData) {
      const key = `inactive_newcomer:${p.participant_id}`;
      const resolved = resolvedMap.get(key);
      if (resolved && !includeResolved) continue;
      
      allItems.push({
        id: p.participant_id,
        type: 'inactive_newcomer',
        title: 'Новичок без активности',
        description: p.full_name || p.username || 'Без имени',
        metadata: {
          days_since_join: p.days_since_join,
          activity_count: p.activity_count,
        },
        link_url: `/p/${orgId}/members/${p.participant_id}`,
        resolved_at: resolved?.resolved_at || null,
        resolved_by_name: resolved?.resolved_by || null,
      });
    }
    
    // Apply pagination
    const total = allItems.length;
    const paginatedItems = allItems.slice(offset, offset + limit);
    
    logger.info({ 
      org_id: orgId, 
      total, 
      returned: paginatedItems.length,
      offset,
      limit 
    }, 'Attention items fetched');
    
    return NextResponse.json({
      items: paginatedItems,
      total,
      hasMore: offset + limit < total,
    });
    
  } catch (error) {
    logger.error({ error }, 'Error fetching attention items');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

