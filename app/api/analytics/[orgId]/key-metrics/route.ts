import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

export const dynamic = 'force-dynamic';

interface ActivityEvent {
  event_type: string;
  tg_user_id: number | null;
  reply_to_message_id: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMetricsForPeriod(
  supabase: any,
  orgId: string,
  telegramChatIds: string[],
  includeWhatsApp: boolean,
  startDate: Date,
  endDate: Date,
  totalMembersInOrg: number
) {
  let allEvents: ActivityEvent[] = [];
  
  // Get Telegram events (without org_id filter for cross-org history)
  if (telegramChatIds.length > 0) {
    const { data: telegramEvents, error: telegramError } = await supabase
      .from('activity_events')
      .select('event_type, tg_user_id, reply_to_message_id')
      .in('tg_chat_id', telegramChatIds)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());
    
    if (!telegramError && telegramEvents) {
      allEvents = [...telegramEvents];
    }
  }
  
  // Get WhatsApp events (with org_id filter)
  if (includeWhatsApp) {
    const { data: whatsappEvents, error: whatsappError } = await supabase
      .from('activity_events')
      .select('event_type, tg_user_id, reply_to_message_id')
      .eq('org_id', orgId)
      .eq('tg_chat_id', 0)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());
    
    if (!whatsappError && whatsappEvents) {
      allEvents = [...allEvents, ...whatsappEvents];
    }
  }

  let messages = 0;
  let reactions = 0;
  let replies = 0;
  const activeUsers = new Set<number>(); // Track by tg_user_id

  allEvents.forEach(event => {
    if (event.event_type === 'message') {
      messages++;
      if (event.tg_user_id) activeUsers.add(event.tg_user_id);
      if (event.reply_to_message_id) replies++;
    } else if (event.event_type === 'reaction') {
      reactions++;
    }
  });

  const activeParticipants = activeUsers.size;
  
  // Вовлечённость = % активных участников от общего числа участников в организации
  // Если totalMembersInOrg = 0, используем activeParticipants как базу
  const engagementBase = totalMembersInOrg > 0 ? totalMembersInOrg : activeParticipants;
  const engagementRate = engagementBase > 0 ? (activeParticipants / engagementBase) * 100 : 0;
  
  // Доля ответов = % сообщений которые являются ответами
  const replyRatio = messages > 0 ? (replies / messages) * 100 : 0;

  return {
    participants: activeParticipants,
    messages,
    reactions,
    replies,
    engagement_rate: Math.min(Math.round(engagementRate * 10) / 10, 100), // Cap at 100%
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

    // Get chat IDs for this org
    let telegramChatIds: string[] = [];
    let includeWhatsApp = false;
    
    if (tgChatId) {
      if (tgChatId === '0') {
        includeWhatsApp = true;
      } else {
        const { data: mapping } = await adminSupabase
          .from('org_telegram_groups')
          .select('tg_chat_id')
          .eq('org_id', orgId)
          .eq('tg_chat_id', tgChatId)
          .maybeSingle();
        
        if (!mapping) {
          return NextResponse.json({ error: 'Group not found in organization' }, { status: 404 });
        }
        telegramChatIds = [tgChatId];
      }
    } else {
      const { data: orgGroups } = await adminSupabase
        .from('org_telegram_groups')
        .select('tg_chat_id')
        .eq('org_id', orgId);
      
      telegramChatIds = orgGroups?.map(g => String(g.tg_chat_id)) || [];
      includeWhatsApp = true; // Include WhatsApp for org-wide metrics
    }

    if (telegramChatIds.length === 0 && !includeWhatsApp) {
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

    // Get total participants count
    // If specific chat ID is provided, get participants for that chat only
    // Otherwise, get participants for entire organization
    let totalMembersInOrg = 0;
    
    if (tgChatId && tgChatId !== '0') {
      // Get participants for specific Telegram group
      // Convert tgChatId to number for comparison with BIGINT field
      const numericChatId = parseInt(tgChatId, 10);
      
      logger.debug({ 
        tg_chat_id: tgChatId, 
        numeric_chat_id: numericChatId, 
        org_id: orgId 
      }, 'Counting participants for specific group');
      
      // Count only valid participants (not archived, not bots, not merged)
      const { count: groupMembersCount, error: countError } = await adminSupabase
        .from('participant_groups')
        .select('participant_id, participants!inner(id)', { count: 'exact', head: true })
        .eq('tg_group_id', numericChatId)
        .eq('is_active', true)
        .eq('participants.org_id', orgId)
        .neq('participants.source', 'bot')
        .is('participants.merged_into', null)
        .neq('participants.participant_status', 'excluded');
      
      if (countError) {
        logger.error({ 
          error: countError.message, 
          tg_chat_id: numericChatId 
        }, 'Error counting group participants');
      }
      
      totalMembersInOrg = groupMembersCount || 0;
      
      logger.debug({ 
        tg_chat_id: numericChatId, 
        member_count: totalMembersInOrg 
      }, 'Group member count result');
    } else {
      // Get total participants count in organization for engagement calculation
      // Исключаем ботов, объединённых дубликатов и архивированных участников
      const { count } = await adminSupabase
        .from('participants')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .neq('source', 'bot')
        .is('merged_into', null)
        .neq('participant_status', 'excluded');
      
      totalMembersInOrg = count || 0;
      
      logger.debug({ 
        org_id: orgId, 
        member_count: totalMembersInOrg 
      }, 'Organization-wide member count result');
    }

    // Calculate date ranges
    const now = new Date();
    const currentEnd = now;
    const currentStart = new Date(now);
    currentStart.setDate(currentStart.getDate() - periodDays);
    
    const previousEnd = new Date(currentStart);
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousStart.getDate() - periodDays);

    // Fetch metrics for both periods
    const [current, previous] = await Promise.all([
      getMetricsForPeriod(adminSupabase, orgId, telegramChatIds, includeWhatsApp, currentStart, currentEnd, totalMembersInOrg || 0),
      getMetricsForPeriod(adminSupabase, orgId, telegramChatIds, includeWhatsApp, previousStart, previousEnd, totalMembersInOrg || 0)
    ]);

    const data = {
      // Общее число участников в организации (для отображения)
      total_participants: totalMembersInOrg || 0,
      // Активные участники за период (кто писал сообщения)
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
      org_id: orgId
    }, 'Key metrics error');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
