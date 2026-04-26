import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

export const dynamic = 'force-dynamic';

// SQL-side aggregation: returns 1 row with all metrics instead of loading thousands of events
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
  const numericTgChatIds = telegramChatIds.map(Number).filter(Number.isFinite);
  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();

  type MetricsRow = { messages: string; reactions: string; replies: string; active_users: string };

  let messages = 0, reactions = 0, replies = 0, activeParticipants = 0;

  const queries: Promise<void>[] = [];

  if (numericTgChatIds.length > 0) {
    queries.push((async () => {
      const { data: rows } = await supabase.raw<MetricsRow>(
        `SELECT COUNT(*) FILTER (WHERE event_type = 'message') AS messages,
                COUNT(*) FILTER (WHERE event_type = 'reaction') AS reactions,
                COUNT(*) FILTER (WHERE event_type = 'message' AND reply_to_message_id IS NOT NULL) AS replies,
                COUNT(DISTINCT tg_user_id) FILTER (WHERE event_type = 'message' AND tg_user_id IS NOT NULL) AS active_users
         FROM activity_events
         WHERE tg_chat_id = ANY($1) AND created_at >= $2 AND created_at <= $3`,
        [numericTgChatIds, startIso, endIso]
      );
      if (rows?.[0]) {
        messages += Number(rows[0].messages) || 0;
        reactions += Number(rows[0].reactions) || 0;
        replies += Number(rows[0].replies) || 0;
        activeParticipants += Number(rows[0].active_users) || 0;
      }
    })());
  }

  if (includeWhatsApp) {
    queries.push((async () => {
      const { data: rows } = await supabase.raw<MetricsRow>(
        `SELECT COUNT(*) FILTER (WHERE event_type = 'message') AS messages,
                COUNT(*) FILTER (WHERE event_type = 'reaction') AS reactions,
                COUNT(*) FILTER (WHERE event_type = 'message' AND reply_to_message_id IS NOT NULL) AS replies,
                COUNT(DISTINCT tg_user_id) FILTER (WHERE event_type = 'message' AND tg_user_id IS NOT NULL) AS active_users
         FROM activity_events
         WHERE org_id = $1 AND tg_chat_id = 0 AND created_at >= $2 AND created_at <= $3`,
        [orgId, startIso, endIso]
      );
      if (rows?.[0]) {
        messages += Number(rows[0].messages) || 0;
        reactions += Number(rows[0].reactions) || 0;
        replies += Number(rows[0].replies) || 0;
        activeParticipants += Number(rows[0].active_users) || 0;
      }
    })());
  }

  await Promise.all(queries);

  const engagementBase = totalMembersInOrg > 0 ? totalMembersInOrg : activeParticipants;
  const engagementRate = engagementBase > 0 ? (activeParticipants / engagementBase) * 100 : 0;
  const replyRatio = messages > 0 ? (replies / messages) * 100 : 0;

  return {
    participants: activeParticipants,
    messages,
    reactions,
    replies,
    engagement_rate: Math.min(Math.round(engagementRate * 10) / 10, 100),
    reply_ratio: Math.round(replyRatio * 10) / 10
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const logger = createAPILogger(req, { endpoint: '/api/analytics/[orgId]/key-metrics' });
  const { orgId } = await params;
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

    // Check org membership (with superadmin fallback)
    const { getEffectiveOrgRole } = await import('@/lib/server/orgAccess')
    const access = await getEffectiveOrgRole(user.id, orgId);

    if (!access) {
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
      
      // Use RPC function for accurate count
      const { data: countResult, error: countError } = await adminSupabase
        .rpc('count_valid_group_participants', {
          p_tg_group_id: numericChatId,
          p_org_id: orgId
        });
      
      if (countError) {
        logger.error({ 
          error: countError.message, 
          error_details: countError,
          tg_chat_id: numericChatId 
        }, 'Error counting group participants');
        
        // Fallback: try direct query
        const { count: fallbackCount, error: fallbackError } = await adminSupabase
          .from('participant_groups')
          .select(`
            participant_id,
            participants!inner(id)
          `, { count: 'exact', head: true })
          .eq('tg_group_id', numericChatId)
          .is('left_at', null)
          .eq('participants.org_id', orgId)
          .neq('participants.source', 'bot')
          .is('participants.merged_into', null)
          .neq('participants.participant_status', 'excluded');
        
        if (fallbackError) {
          logger.error({ error: fallbackError.message }, 'Fallback count also failed');
        }
        
        totalMembersInOrg = fallbackCount || 0;
      } else {
        // Handle RPC result - it can be a number, string (BIGINT), array, or object
        if (typeof countResult === 'number') {
          totalMembersInOrg = countResult;
        } else if (typeof countResult === 'string') {
          // BIGINT from PostgreSQL may come as string
          totalMembersInOrg = parseInt(countResult, 10) || 0;
        } else if (Array.isArray(countResult) && countResult.length > 0) {
          // RPC may return an array with a single row
          const firstRow = countResult[0];
          if (typeof firstRow === 'number') {
            totalMembersInOrg = firstRow;
          } else if (typeof firstRow === 'string') {
            totalMembersInOrg = parseInt(firstRow, 10) || 0;
          } else if (firstRow && typeof firstRow === 'object') {
            const value = firstRow?.count_valid_group_participants ?? firstRow?.count ?? 0;
            totalMembersInOrg = typeof value === 'string' ? parseInt(value, 10) || 0 : Number(value) || 0;
          } else {
            totalMembersInOrg = 0;
          }
        } else if (countResult && typeof countResult === 'object') {
          // RPC may return an object with the result
          const value = (countResult as any).count_valid_group_participants ?? 
                        (countResult as any).count ?? 
                        (countResult as any).result ?? 0;
          totalMembersInOrg = typeof value === 'string' ? parseInt(value, 10) || 0 : Number(value) || 0;
        } else {
          totalMembersInOrg = 0;
        }
        
        // Ensure it's always a number
        totalMembersInOrg = Number(totalMembersInOrg) || 0;
        
        logger.debug({ 
          raw_count_result: countResult,
          raw_type: typeof countResult,
          parsed_count: totalMembersInOrg,
          is_number: typeof totalMembersInOrg === 'number'
        }, 'Parsed RPC count result');
      }
      
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
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
