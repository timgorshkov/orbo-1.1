import { NextRequest, NextResponse } from 'next/server';
import { createClientServer } from '@/lib/server/supabaseServer';
import { createClient } from '@supabase/supabase-js';
import { createAPILogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { orgId: string } }
) {
  const logger = createAPILogger(req, { endpoint: '/api/analytics/[orgId]/timeline' });
  const orgId = params.orgId;
  try {
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get('days') || '30');
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

    // Use admin client for queries
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // Get chat IDs for this org (if no specific chat requested)
    let telegramChatIds: string[] = [];
    let includeWhatsApp = false;
    
    if (tgChatId) {
      if (tgChatId === '0') {
        includeWhatsApp = true;
      } else {
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
        telegramChatIds = [tgChatId];
      }
    } else {
      // Get all chats for org
      const { data: orgGroups } = await adminSupabase
        .from('org_telegram_groups')
        .select('tg_chat_id')
        .eq('org_id', orgId);
      
      telegramChatIds = orgGroups?.map(g => String(g.tg_chat_id)) || [];
      includeWhatsApp = true; // Include WhatsApp for org-wide timeline
    }

    // Initialize daily data
    const dailyData: Record<string, { message_count: number; reaction_count: number }> = {};
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      dailyData[dateKey] = { message_count: 0, reaction_count: 0 };
    }

    if (telegramChatIds.length === 0 && !includeWhatsApp) {
      // No data sources
      const data = Object.entries(dailyData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, counts]) => ({
          date,
          message_count: counts.message_count,
          reaction_count: counts.reaction_count
        }));
      return NextResponse.json({ data });
    }

    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Fetch Telegram events - NO org_id filter!
    if (telegramChatIds.length > 0) {
      const { data: telegramEvents, error: telegramError } = await adminSupabase
        .from('activity_events')
        .select('created_at, event_type')
        .in('tg_chat_id', telegramChatIds)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });

      if (telegramError) {
        logger.error({ error: telegramError.message }, 'Error fetching telegram events');
      } else {
        telegramEvents?.forEach(event => {
          const dateKey = event.created_at.split('T')[0];
          if (dailyData[dateKey]) {
            if (event.event_type === 'message') {
              dailyData[dateKey].message_count++;
            } else if (event.event_type === 'reaction') {
              dailyData[dateKey].reaction_count++;
            }
          }
        });
      }
    }

    // Fetch WhatsApp events - WITH org_id filter
    if (includeWhatsApp) {
      const { data: whatsappEvents, error: whatsappError } = await adminSupabase
        .from('activity_events')
        .select('created_at, event_type')
        .eq('org_id', orgId)
        .eq('tg_chat_id', 0)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });

      if (whatsappError) {
        logger.error({ error: whatsappError.message }, 'Error fetching whatsapp events');
      } else {
        whatsappEvents?.forEach(event => {
          const dateKey = event.created_at.split('T')[0];
          if (dailyData[dateKey]) {
            if (event.event_type === 'message') {
              dailyData[dateKey].message_count++;
            } else if (event.event_type === 'reaction') {
              dailyData[dateKey].reaction_count++;
            }
          }
        });
      }
    }

    // Convert to array
    const data = Object.entries(dailyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({
        date,
        message_count: counts.message_count,
        reaction_count: counts.reaction_count
      }));

    logger.debug({ 
      org_id: orgId, 
      telegram_chats: telegramChatIds.length,
      include_whatsapp: includeWhatsApp,
      days,
      total_messages: data.reduce((sum, d) => sum + d.message_count, 0)
    }, 'Timeline data fetched');

    return NextResponse.json({ data });
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      org_id: orgId
    }, 'Timeline error');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
