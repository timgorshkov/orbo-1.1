import { NextRequest, NextResponse } from 'next/server';
import { createClientServer } from '@/lib/server/supabaseServer';
import { createClient } from '@supabase/supabase-js';
import { createAPILogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { orgId: string } }
) {
  const logger = createAPILogger(req, { endpoint: '/api/analytics/[orgId]/key-metrics' });
  const orgId = params.orgId;
  try {
    const { searchParams } = new URL(req.url);
    const periodDays = parseInt(searchParams.get('periodDays') || '14');
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
      return NextResponse.json({ 
        data: {
          total_messages: 0,
          total_reactions: 0,
          unique_users: 0,
          avg_messages_per_day: 0,
          reply_ratio: 0
        }
      });
    }

    // Get activity - NO org_id filter!
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    const { data: events, error: eventsError } = await adminSupabase
      .from('activity_events')
      .select('event_type, tg_user_id, reply_to_message_id, created_at')
      .in('tg_chat_id', chatIds)
      .gte('created_at', startDate.toISOString());

    if (eventsError) {
      logger.error({ error: eventsError.message }, 'Error fetching events');
      return NextResponse.json({ error: eventsError.message }, { status: 500 });
    }

    // Calculate metrics
    let totalMessages = 0;
    let totalReactions = 0;
    let totalReplies = 0;
    const uniqueUsers = new Set<number>();
    const messagesByDay: Record<string, number> = {};

    events?.forEach(event => {
      if (event.event_type === 'message') {
        totalMessages++;
        if (event.tg_user_id) {
          uniqueUsers.add(event.tg_user_id);
        }
        if (event.reply_to_message_id) {
          totalReplies++;
        }
        const dateKey = event.created_at.split('T')[0];
        messagesByDay[dateKey] = (messagesByDay[dateKey] || 0) + 1;
      } else if (event.event_type === 'reaction') {
        totalReactions++;
      }
    });

    const daysWithActivity = Object.keys(messagesByDay).length;
    const avgMessagesPerDay = daysWithActivity > 0 
      ? Math.round(totalMessages / daysWithActivity * 10) / 10 
      : 0;
    const replyRatio = totalMessages > 0 
      ? Math.round((totalReplies / totalMessages) * 100) 
      : 0;

    const data = {
      total_messages: totalMessages,
      total_reactions: totalReactions,
      unique_users: uniqueUsers.size,
      avg_messages_per_day: avgMessagesPerDay,
      reply_ratio: replyRatio
    };

    logger.debug({ 
      org_id: orgId, 
      chat_ids: chatIds.length,
      events_count: events?.length || 0,
      metrics: data
    }, 'Key metrics fetched');

    return NextResponse.json({ data });
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      org_id: orgId
    }, 'Key metrics error');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
