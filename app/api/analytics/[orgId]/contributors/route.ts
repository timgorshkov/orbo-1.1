import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

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

    // Use admin client (already created above)

    // Get chat IDs for this org (including WhatsApp with tg_chat_id = 0)
    let chatIds: string[] = [];
    
    if (tgChatId) {
      // Specific chat requested
      if (tgChatId === '0') {
        // WhatsApp - check if org has WhatsApp imports
        chatIds = ['0'];
      } else {
        // Telegram group - verify it belongs to org
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
      }
    } else {
      // Get all Telegram chats for org
      const { data: orgGroups } = await adminSupabase
        .from('org_telegram_groups')
        .select('tg_chat_id')
        .eq('org_id', orgId);
      
      chatIds = orgGroups?.map(g => String(g.tg_chat_id)) || [];
      // Also include WhatsApp (tg_chat_id = 0)
      chatIds.push('0');
    }

    if (chatIds.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // Get last 30 days of activity - NO org_id filter for Telegram!
    // But for WhatsApp (tg_chat_id = 0) we need org_id filter
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    // Get Telegram events (without org_id filter for cross-org history)
    const telegramChatIds = chatIds.filter(id => id !== '0');
    const includeWhatsApp = chatIds.includes('0');
    
    let allEvents: any[] = [];
    
    if (telegramChatIds.length > 0) {
      const { data: telegramEvents, error: telegramError } = await adminSupabase
        .from('activity_events')
        .select('tg_user_id, event_type, meta')
        .in('tg_chat_id', telegramChatIds)
        .in('event_type', ['message', 'reaction'])
        .gte('created_at', startDate.toISOString())
        .not('tg_user_id', 'is', null);
      
      if (telegramError) {
        logger.error({ error: telegramError.message }, 'Error fetching telegram events');
      } else {
        allEvents = [...(telegramEvents || [])];
      }
    }
    
    // Get WhatsApp events (with org_id filter)
    if (includeWhatsApp) {
      const { data: whatsappEvents, error: whatsappError } = await adminSupabase
        .from('activity_events')
        .select('tg_user_id, event_type, meta')
        .eq('org_id', orgId)
        .eq('tg_chat_id', 0)
        .in('event_type', ['message', 'reaction'])
        .gte('created_at', startDate.toISOString());
      
      if (whatsappError) {
        logger.error({ error: whatsappError.message }, 'Error fetching whatsapp events');
      } else {
        allEvents = [...allEvents, ...(whatsappEvents || [])];
      }
    }

    // Aggregate by tg_user_id
    const userCounts: Record<number, { 
      message_count: number; 
      reaction_count: number;
      tg_user_id: number;
      username?: string; 
      full_name?: string;
      tg_first_name?: string;
      tg_last_name?: string;
    }> = {};
    
    allEvents.forEach(event => {
      const userId = event.tg_user_id;
      if (!userId) return;
      
      // Filter out system accounts
      const SYSTEM_ACCOUNT_IDS = [
        777000,      // Telegram Service Notifications
        136817688,   // @Channel_Bot
        1087968824   // Group Anonymous Bot
      ];
      if (SYSTEM_ACCOUNT_IDS.includes(userId)) return;
      
      if (!userCounts[userId]) {
        userCounts[userId] = { 
          message_count: 0,
          reaction_count: 0,
          tg_user_id: userId,
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
      
      // Update username/name if available from meta
      if (event.meta?.from?.username && !userCounts[userId].username) {
        userCounts[userId].username = event.meta.from.username;
      }
      if (event.meta?.from?.first_name && !userCounts[userId].tg_first_name) {
        userCounts[userId].tg_first_name = event.meta.from.first_name;
        userCounts[userId].tg_last_name = event.meta.from.last_name;
        userCounts[userId].full_name = `${event.meta.from.first_name} ${event.meta.from.last_name || ''}`.trim();
      }
    });

    // Sort and prepare data
    const sortedEntries = Object.values(userCounts)
      .sort((a, b) => (b.message_count + b.reaction_count) - (a.message_count + a.reaction_count))
      .slice(0, limit * 2); // Get more to enrich

    // Collect tg_user_ids without full_name for enrichment
    const tgUserIdsToEnrich = sortedEntries
      .filter(data => !data.full_name)
      .map(data => data.tg_user_id);

    // Enrich from participants table
    let participantNames: Record<number, { full_name: string | null; username: string | null; participant_id: string | null }> = {};
    
    if (tgUserIdsToEnrich.length > 0) {
      const { data: participantsByTgId } = await adminSupabase
        .from('participants')
        .select('id, tg_user_id, full_name, username')
        .eq('org_id', orgId)
        .in('tg_user_id', tgUserIdsToEnrich);
      
      participantsByTgId?.forEach(p => {
        if (p.tg_user_id) {
          participantNames[p.tg_user_id] = { 
            full_name: p.full_name, 
            username: p.username,
            participant_id: p.id
          };
        }
      });
    }

    // Build final result with enriched names
    const sorted = sortedEntries
      .map((data, index) => {
        const enriched = participantNames[data.tg_user_id];
        const finalFullName = data.full_name || enriched?.full_name || null;
        const finalUsername = data.username || enriched?.username || null;
        
        return {
          tg_user_id: data.tg_user_id,
          participant_id: enriched?.participant_id || null,
          message_count: data.message_count,
          reaction_count: data.reaction_count,
          activity_count: data.message_count + data.reaction_count,
          username: finalUsername,
          full_name: finalFullName,
          tg_first_name: data.tg_first_name || null,
          tg_last_name: data.tg_last_name || null,
          rank: 0,
          rank_change: 0
        };
      })
      .slice(0, limit)
      .map((item, index) => ({ ...item, rank: index + 1 }));

    // Add cache headers - data is user-specific but can be cached briefly
    return NextResponse.json({ data: sorted }, {
      headers: {
        'Cache-Control': 'private, max-age=60, stale-while-revalidate=120'
      }
    });
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
