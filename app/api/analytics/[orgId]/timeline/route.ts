import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

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

    // Use admin client for queries (already created above)

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
      // Get all Telegram chats for org
      const { data: orgGroups } = await adminSupabase
        .from('org_telegram_groups')
        .select('tg_chat_id')
        .eq('org_id', orgId);
      
      telegramChatIds = orgGroups?.map(g => String(g.tg_chat_id)) || [];
      includeWhatsApp = true; // Include WhatsApp for org-wide timeline
    }

    // Linked MAX groups (for org-wide timeline)
    let maxChatIds: string[] = [];
    if (!tgChatId) {
      const { data: orgMaxLinks } = await adminSupabase
        .from('org_max_groups')
        .select('max_chat_id')
        .eq('org_id', orgId);
      maxChatIds = (orgMaxLinks ?? []).map((r: { max_chat_id: number }) => String(r.max_chat_id));
    }

    // Org timezone for date bucketing (default Moscow GMT+3)
    const { data: orgRow } = await adminSupabase
      .from('organizations')
      .select('timezone')
      .eq('id', orgId)
      .maybeSingle();
    const orgTimezone = (orgRow?.timezone as string) || 'Europe/Moscow';

    const toDateKey = (iso: string | Date) => {
      const d = typeof iso === 'string' ? new Date(iso) : iso;
      return d.toLocaleDateString('en-CA', { timeZone: orgTimezone });
    };

    // Initialize daily data (keys in org timezone)
    const dailyData: Record<string, { message_count: number; reaction_count: number }> = {};
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toLocaleDateString('en-CA', { timeZone: orgTimezone });
      dailyData[dateKey] = { message_count: 0, reaction_count: 0 };
    }

    if (telegramChatIds.length === 0 && !includeWhatsApp && maxChatIds.length === 0) {
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
          const createdAt = event.created_at instanceof Date
            ? event.created_at.toISOString()
            : String(event.created_at);
          const dateKey = toDateKey(createdAt);
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
          const createdAt = event.created_at instanceof Date
            ? event.created_at.toISOString()
            : String(event.created_at);
          const dateKey = toDateKey(createdAt);
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

    // Fetch MAX group events - org_id + messenger_type + max_chat_id in linked groups
    if (maxChatIds.length > 0) {
      const { data: maxEvents, error: maxError } = await adminSupabase
        .from('activity_events')
        .select('created_at, event_type')
        .eq('org_id', orgId)
        .eq('messenger_type', 'max')
        .eq('event_type', 'message')
        .in('max_chat_id', maxChatIds)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });

      if (maxError) {
        logger.error({ error: maxError.message }, 'Error fetching MAX events');
      } else {
        maxEvents?.forEach(event => {
          const createdAt = event.created_at instanceof Date
            ? event.created_at.toISOString()
            : String(event.created_at);
          const dateKey = toDateKey(createdAt);
          if (dailyData[dateKey]) {
            dailyData[dateKey].message_count++;
          }
        });
        logger.debug({ count: maxEvents?.length ?? 0, org_id: orgId }, 'Added MAX events to timeline');
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
    }, 'Timeline error');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
