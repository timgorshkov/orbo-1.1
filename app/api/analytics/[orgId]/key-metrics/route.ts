import { NextRequest, NextResponse } from 'next/server';
import { createClientServer } from '@/lib/server/supabaseServer';
import { createClient } from '@supabase/supabase-js';
import { createAPILogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface ActivityEvent {
  event_type: string;
  tg_user_id: number | null;
  reply_to_message_id: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMetricsForPeriod(
  supabase: any,
  chatIds: string[],
  startDate: Date,
  endDate: Date
) {
  const { data: events, error } = await supabase
    .from('activity_events')
    .select('event_type, tg_user_id, reply_to_message_id')
    .in('tg_chat_id', chatIds)
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString());

  if (error) throw error;

  let messages = 0;
  let reactions = 0;
  let replies = 0;
  const uniqueUsers = new Set<number>();

  (events as ActivityEvent[] | null)?.forEach(event => {
    if (event.event_type === 'message') {
      messages++;
      if (event.tg_user_id) uniqueUsers.add(event.tg_user_id);
      if (event.reply_to_message_id) replies++;
    } else if (event.event_type === 'reaction') {
      reactions++;
    }
  });

  const participants = uniqueUsers.size;
  const engagementRate = participants > 0 ? (messages / participants) * 100 : 0;
  const replyRatio = messages > 0 ? (replies / messages) * 100 : 0;

  return {
    participants,
    messages,
    reactions,
    replies,
    engagement_rate: Math.round(engagementRate * 10) / 10,
    reply_ratio: Math.round(replyRatio * 10) / 10
  };
}

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
          current_participants: 0,
          current_messages: 0,
          current_engagement_rate: 0,
          current_replies: 0,
          current_reactions: 0,
          current_reply_ratio: 0,
          previous_participants: 0,
          previous_messages: 0,
          previous_engagement_rate: 0,
          previous_replies: 0,
          previous_reactions: 0,
          previous_reply_ratio: 0
        }
      });
    }

    // Calculate date ranges
    const now = new Date();
    const currentEnd = now;
    const currentStart = new Date(now);
    currentStart.setDate(currentStart.getDate() - periodDays);
    
    const previousEnd = new Date(currentStart);
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousStart.getDate() - periodDays);

    // Fetch metrics for both periods - NO org_id filter!
    const [current, previous] = await Promise.all([
      getMetricsForPeriod(adminSupabase, chatIds, currentStart, currentEnd),
      getMetricsForPeriod(adminSupabase, chatIds, previousStart, previousEnd)
    ]);

    const data = {
      current_participants: current.participants,
      current_messages: current.messages,
      current_engagement_rate: current.engagement_rate,
      current_replies: current.replies,
      current_reactions: current.reactions,
      current_reply_ratio: current.reply_ratio,
      previous_participants: previous.participants,
      previous_messages: previous.messages,
      previous_engagement_rate: previous.engagement_rate,
      previous_replies: previous.replies,
      previous_reactions: previous.reactions,
      previous_reply_ratio: previous.reply_ratio
    };

    logger.debug({ 
      org_id: orgId, 
      chat_ids: chatIds.length,
      period_days: periodDays,
      current_messages: current.messages,
      previous_messages: previous.messages
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
