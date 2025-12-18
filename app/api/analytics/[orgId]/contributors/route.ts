import { NextRequest, NextResponse } from 'next/server';
import { createClientServer } from '@/lib/server/supabaseServer';
import { createClient } from '@supabase/supabase-js';
import { createAPILogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { orgId: string } }
) {
  const logger = createAPILogger(req, { endpoint: '/api/analytics/[orgId]/contributors' });
  const orgId = params.orgId;
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '10');
    const tgChatId = searchParams.get('tgChatId');

    // Check authentication
    const supabase = await createClientServer();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check org membership
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Use admin client
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // Get chat IDs for this org
    let chatIds: string[] = [];
    
    if (tgChatId) {
      // Verify this chat belongs to org
      const { data: mapping } = await adminSupabase
        .from('org_telegram_groups')
        .select('tg_chat_id')
        .eq('org_id', orgId)
        .eq('tg_chat_id', tgChatId)
        .maybeSingle();
      
      if (!mapping) {
        return NextResponse.json({ error: 'Group not found in organization' }, { status: 404 });
      }
      chatIds = [tgChatId];
    } else {
      const { data: orgGroups } = await adminSupabase
        .from('org_telegram_groups')
        .select('tg_chat_id')
        .eq('org_id', orgId);
      
      chatIds = orgGroups?.map(g => String(g.tg_chat_id)) || [];
    }

    if (chatIds.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // Get last 30 days of activity - NO org_id filter!
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const { data: events, error: eventsError } = await adminSupabase
      .from('activity_events')
      .select('tg_user_id, event_type, meta')
      .in('tg_chat_id', chatIds)
      .in('event_type', ['message', 'reaction'])
      .gte('created_at', startDate.toISOString())
      .not('tg_user_id', 'is', null);

    if (eventsError) {
      logger.error({ error: eventsError.message }, 'Error fetching events');
      return NextResponse.json({ error: eventsError.message }, { status: 500 });
    }

    // Aggregate by user
    const userCounts: Record<number, { 
      message_count: number; 
      reaction_count: number;
      username?: string; 
      full_name?: string;
      tg_first_name?: string;
      tg_last_name?: string;
    }> = {};
    
    events?.forEach(event => {
      const userId = event.tg_user_id;
      if (!userId || userId === 1087968824) return; // Skip anonymous bot
      
      if (!userCounts[userId]) {
        userCounts[userId] = { 
          message_count: 0,
          reaction_count: 0,
          username: event.meta?.from?.username,
          tg_first_name: event.meta?.from?.first_name,
          tg_last_name: event.meta?.from?.last_name,
          full_name: event.meta?.from?.first_name 
            ? `${event.meta.from.first_name} ${event.meta.from.last_name || ''}`.trim()
            : undefined
        };
      }
      
      if (event.event_type === 'message') {
        userCounts[userId].message_count++;
      } else if (event.event_type === 'reaction') {
        userCounts[userId].reaction_count++;
      }
      
      // Update username/name if available
      if (event.meta?.from?.username && !userCounts[userId].username) {
        userCounts[userId].username = event.meta.from.username;
      }
      if (event.meta?.from?.first_name && !userCounts[userId].tg_first_name) {
        userCounts[userId].tg_first_name = event.meta.from.first_name;
        userCounts[userId].tg_last_name = event.meta.from.last_name;
        userCounts[userId].full_name = `${event.meta.from.first_name} ${event.meta.from.last_name || ''}`.trim();
      }
    });

    // Sort and limit
    const sorted = Object.entries(userCounts)
      .map(([tg_user_id, data], index) => ({
        tg_user_id: parseInt(tg_user_id),
        participant_id: null, // Will be enriched if needed
        message_count: data.message_count,
        reaction_count: data.reaction_count,
        activity_count: data.message_count + data.reaction_count,
        username: data.username || null,
        full_name: data.full_name || null,
        tg_first_name: data.tg_first_name || null,
        tg_last_name: data.tg_last_name || null,
        rank: 0, // Will be set after sorting
        rank_change: 0 // No historical comparison in this simplified version
      }))
      .sort((a, b) => b.activity_count - a.activity_count)
      .slice(0, limit)
      .map((item, index) => ({ ...item, rank: index + 1 }));

    logger.debug({ 
      org_id: orgId, 
      chat_ids: chatIds.length,
      contributors_count: sorted.length
    }, 'Contributors data fetched');

    return NextResponse.json({ data: sorted });
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      org_id: orgId
    }, 'Contributors error');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
