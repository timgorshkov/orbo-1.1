import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const logger = createAPILogger(req, { endpoint: '/api/analytics/[orgId]/heatmap' });
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

    // Use admin client (already created above)

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
      includeWhatsApp = true;
    }

    // Build heatmap: day_of_week (0=Sun, 6=Sat) x hour_of_day (0-23)
    const heatmap: Record<string, number> = {};
    
    // Initialize all cells
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        heatmap[`${day}-${hour}`] = 0;
      }
    }

    if (telegramChatIds.length === 0 && !includeWhatsApp) {
      // Return empty heatmap
      const data: { day_of_week: number; hour_of_day: number; message_count: number }[] = [];
      for (let day = 0; day < 7; day++) {
        for (let hour = 0; hour < 24; hour++) {
          data.push({ day_of_week: day, hour_of_day: hour, message_count: 0 });
        }
      }
      return NextResponse.json({ data });
    }

    // SQL-side aggregation: GROUP BY day_of_week, hour — returns max 168 rows instead of thousands
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startIso = startDate.toISOString();
    const numericTgChatIds = telegramChatIds.map(Number).filter(Number.isFinite);

    const queries: Promise<void>[] = [];

    if (numericTgChatIds.length > 0) {
      queries.push((async () => {
        const { data: rows, error: err } = await adminSupabase.raw<{ dow: string; hour: string; cnt: string }>(
          `SELECT EXTRACT(DOW FROM created_at)::int AS dow,
                  EXTRACT(HOUR FROM created_at)::int AS hour,
                  COUNT(*) AS cnt
           FROM activity_events
           WHERE tg_chat_id = ANY($1) AND event_type = 'message' AND created_at >= $2
           GROUP BY 1, 2`,
          [numericTgChatIds, startIso]
        );
        if (err) {
          logger.error({ error: err.message }, 'Error fetching telegram heatmap');
        } else {
          rows?.forEach(r => {
            const key = `${r.dow}-${r.hour}`;
            heatmap[key] = (heatmap[key] || 0) + (Number(r.cnt) || 0);
          });
        }
      })());
    }

    if (includeWhatsApp) {
      queries.push((async () => {
        const { data: rows, error: err } = await adminSupabase.raw<{ dow: string; hour: string; cnt: string }>(
          `SELECT EXTRACT(DOW FROM created_at)::int AS dow,
                  EXTRACT(HOUR FROM created_at)::int AS hour,
                  COUNT(*) AS cnt
           FROM activity_events
           WHERE org_id = $1 AND tg_chat_id = 0 AND event_type = 'message' AND created_at >= $2
           GROUP BY 1, 2`,
          [orgId, startIso]
        );
        if (err) {
          logger.error({ error: err.message }, 'Error fetching whatsapp heatmap');
        } else {
          rows?.forEach(r => {
            const key = `${r.dow}-${r.hour}`;
            heatmap[key] = (heatmap[key] || 0) + (Number(r.cnt) || 0);
          });
        }
      })());
    }

    await Promise.all(queries);

    // Convert to array format
    const data: { day_of_week: number; hour_of_day: number; message_count: number }[] = [];
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        data.push({
          day_of_week: day,
          hour_of_day: hour,
          message_count: heatmap[`${day}-${hour}`]
        });
      }
    }

    // Add cache headers - data is user-specific but can be cached briefly
    return NextResponse.json({ data }, {
      headers: {
        'Cache-Control': 'private, max-age=120, stale-while-revalidate=300'
      }
    });
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      org_id: orgId
    }, 'Heatmap error');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
