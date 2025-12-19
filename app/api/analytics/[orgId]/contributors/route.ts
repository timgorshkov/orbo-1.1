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
        .select('tg_user_id, event_type, meta, participant_id')
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
        .select('tg_user_id, event_type, meta, participant_id')
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

    // Aggregate by user (using participant_id for WhatsApp, tg_user_id for Telegram)
    const userCounts: Record<string, { 
      message_count: number; 
      reaction_count: number;
      tg_user_id: number | null;
      participant_id: string | null;
      username?: string; 
      full_name?: string;
      tg_first_name?: string;
      tg_last_name?: string;
    }> = {};
    
    allEvents.forEach(event => {
      // Use participant_id if available (WhatsApp), otherwise tg_user_id (Telegram)
      const uniqueKey = event.participant_id 
        ? `p_${event.participant_id}` 
        : event.tg_user_id 
          ? `t_${event.tg_user_id}`
          : null;
      
      if (!uniqueKey) return;
      if (event.tg_user_id === 1087968824) return; // Skip anonymous bot
      
      if (!userCounts[uniqueKey]) {
        userCounts[uniqueKey] = { 
          message_count: 0,
          reaction_count: 0,
          tg_user_id: event.tg_user_id || null,
          participant_id: event.participant_id || null,
          username: event.meta?.from?.username,
          tg_first_name: event.meta?.from?.first_name,
          tg_last_name: event.meta?.from?.last_name,
          full_name: event.meta?.from?.first_name 
            ? `${event.meta.from.first_name} ${event.meta.from.last_name || ''}`.trim()
            : undefined
        };
      }
      
      if (event.event_type === 'message') {
        userCounts[uniqueKey].message_count++;
      } else if (event.event_type === 'reaction') {
        userCounts[uniqueKey].reaction_count++;
      }
      
      // Update username/name if available from meta
      if (event.meta?.from?.username && !userCounts[uniqueKey].username) {
        userCounts[uniqueKey].username = event.meta.from.username;
      }
      if (event.meta?.from?.first_name && !userCounts[uniqueKey].tg_first_name) {
        userCounts[uniqueKey].tg_first_name = event.meta.from.first_name;
        userCounts[uniqueKey].tg_last_name = event.meta.from.last_name;
        userCounts[uniqueKey].full_name = `${event.meta.from.first_name} ${event.meta.from.last_name || ''}`.trim();
      }
    });

    // Sort and prepare data
    const sortedEntries = Object.entries(userCounts)
      .sort(([, a], [, b]) => (b.message_count + b.reaction_count) - (a.message_count + a.reaction_count))
      .slice(0, limit * 2); // Get more to enrich

    // Collect IDs to enrich from participants table
    const participantIds = sortedEntries
      .filter(([, data]) => data.participant_id)
      .map(([, data]) => data.participant_id!);
    
    const tgUserIds = sortedEntries
      .filter(([, data]) => data.tg_user_id && !data.full_name)
      .map(([, data]) => data.tg_user_id!);

    // Enrich from participants table
    let participantNames: Record<string, { full_name: string | null; username: string | null }> = {};
    
    if (participantIds.length > 0) {
      const { data: participantsById } = await adminSupabase
        .from('participants')
        .select('id, full_name, username')
        .in('id', participantIds);
      
      participantsById?.forEach(p => {
        participantNames[`p_${p.id}`] = { full_name: p.full_name, username: p.username };
      });
    }
    
    if (tgUserIds.length > 0) {
      const { data: participantsByTgId } = await adminSupabase
        .from('participants')
        .select('tg_user_id, full_name, username')
        .eq('org_id', orgId)
        .in('tg_user_id', tgUserIds);
      
      participantsByTgId?.forEach(p => {
        if (p.tg_user_id) {
          participantNames[`t_${p.tg_user_id}`] = { full_name: p.full_name, username: p.username };
        }
      });
    }

    // Build final result with enriched names
    const sorted = sortedEntries
      .map(([key, data], index) => {
        const enriched = participantNames[key];
        const finalFullName = data.full_name || enriched?.full_name || null;
        const finalUsername = data.username || enriched?.username || null;
        
        return {
          tg_user_id: data.tg_user_id || 0,
          participant_id: data.participant_id,
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

    logger.debug({ 
      org_id: orgId, 
      chat_ids: chatIds.length,
      contributors_count: sorted.length,
      include_whatsapp: includeWhatsApp
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
