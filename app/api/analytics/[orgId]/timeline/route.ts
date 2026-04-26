import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const logger = createAPILogger(req, { endpoint: '/api/analytics/[orgId]/timeline' });
  const { orgId } = await params;
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
    const startIso = startDate.toISOString();

    // SQL-side aggregation: GROUP BY date in org timezone — returns ~30 rows instead of thousands
    const numericTgChatIds = telegramChatIds.map(Number).filter(Number.isFinite);
    const numericMaxChatIds = maxChatIds.map(Number).filter(Number.isFinite);

    const queries: Promise<void>[] = [];

    // Telegram events (no org_id filter for cross-org history)
    if (numericTgChatIds.length > 0) {
      queries.push((async () => {
        const { data: rows, error: err } = await adminSupabase.raw<{ date: string; message_count: string; reaction_count: string }>(
          `SELECT (created_at AT TIME ZONE $1)::date::text AS date,
                  COUNT(*) FILTER (WHERE event_type = 'message') AS message_count,
                  COUNT(*) FILTER (WHERE event_type = 'reaction') AS reaction_count
           FROM activity_events
           WHERE tg_chat_id = ANY($2) AND created_at >= $3
           GROUP BY 1`,
          [orgTimezone, numericTgChatIds, startIso]
        );
        if (err) {
          logger.error({ error: err.message }, 'Error fetching telegram events');
        } else {
          rows?.forEach(r => {
            if (dailyData[r.date]) {
              dailyData[r.date].message_count += Number(r.message_count) || 0;
              dailyData[r.date].reaction_count += Number(r.reaction_count) || 0;
            }
          });
        }
      })());
    }

    // WhatsApp events (org_id filter)
    if (includeWhatsApp) {
      queries.push((async () => {
        const { data: rows, error: err } = await adminSupabase.raw<{ date: string; message_count: string; reaction_count: string }>(
          `SELECT (created_at AT TIME ZONE $1)::date::text AS date,
                  COUNT(*) FILTER (WHERE event_type = 'message') AS message_count,
                  COUNT(*) FILTER (WHERE event_type = 'reaction') AS reaction_count
           FROM activity_events
           WHERE org_id = $2 AND tg_chat_id = 0 AND created_at >= $3
           GROUP BY 1`,
          [orgTimezone, orgId, startIso]
        );
        if (err) {
          logger.error({ error: err.message }, 'Error fetching whatsapp events');
        } else {
          rows?.forEach(r => {
            if (dailyData[r.date]) {
              dailyData[r.date].message_count += Number(r.message_count) || 0;
              dailyData[r.date].reaction_count += Number(r.reaction_count) || 0;
            }
          });
        }
      })());
    }

    // MAX group events
    if (numericMaxChatIds.length > 0) {
      queries.push((async () => {
        const { data: rows, error: err } = await adminSupabase.raw<{ date: string; message_count: string }>(
          `SELECT (created_at AT TIME ZONE $1)::date::text AS date,
                  COUNT(*) AS message_count
           FROM activity_events
           WHERE org_id = $2 AND messenger_type = 'max' AND event_type = 'message'
             AND max_chat_id = ANY($3) AND created_at >= $4
           GROUP BY 1`,
          [orgTimezone, orgId, numericMaxChatIds, startIso]
        );
        if (err) {
          logger.error({ error: err.message }, 'Error fetching MAX events');
        } else {
          rows?.forEach(r => {
            if (dailyData[r.date]) {
              dailyData[r.date].message_count += Number(r.message_count) || 0;
            }
          });
        }
      })());
    }

    await Promise.all(queries);

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
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
