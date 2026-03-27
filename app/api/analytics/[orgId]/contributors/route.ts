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

    // Check org membership (with superadmin fallback)
    const { getEffectiveOrgRole } = await import('@/lib/server/orgAccess')
    const access = await getEffectiveOrgRole(user.id, orgId);

    if (!access) {
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

    // SQL-side aggregation: GROUP BY tg_user_id — returns only top contributors
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const startIso = startDate.toISOString();

    const telegramChatIds = chatIds.filter(id => id !== '0');
    const includeWhatsApp = chatIds.includes('0');
    const numericTgChatIds = telegramChatIds.map(Number).filter(Number.isFinite);

    const SYSTEM_ACCOUNT_IDS = [777000, 136817688, 1087968824];
    const topN = limit * 2;

    type ContributorRow = { tg_user_id: string; message_count: string; reaction_count: string };
    const userCounts: Record<number, { message_count: number; reaction_count: number; tg_user_id: number }> = {};

    const queries: Promise<void>[] = [];

    if (numericTgChatIds.length > 0) {
      queries.push((async () => {
        const { data: rows, error: err } = await adminSupabase.raw<ContributorRow>(
          `SELECT tg_user_id,
                  COUNT(*) FILTER (WHERE event_type = 'message') AS message_count,
                  COUNT(*) FILTER (WHERE event_type = 'reaction') AS reaction_count
           FROM activity_events
           WHERE tg_chat_id = ANY($1)
             AND event_type IN ('message', 'reaction')
             AND created_at >= $2
             AND tg_user_id IS NOT NULL
             AND tg_user_id != ALL($3)
           GROUP BY tg_user_id
           ORDER BY COUNT(*) DESC
           LIMIT $4`,
          [numericTgChatIds, startIso, SYSTEM_ACCOUNT_IDS, topN]
        );
        if (err) {
          logger.error({ error: err.message }, 'Error fetching telegram contributors');
        } else {
          rows?.forEach(r => {
            const uid = Number(r.tg_user_id);
            if (!userCounts[uid]) userCounts[uid] = { message_count: 0, reaction_count: 0, tg_user_id: uid };
            userCounts[uid].message_count += Number(r.message_count) || 0;
            userCounts[uid].reaction_count += Number(r.reaction_count) || 0;
          });
        }
      })());
    }

    if (includeWhatsApp) {
      queries.push((async () => {
        const { data: rows, error: err } = await adminSupabase.raw<ContributorRow>(
          `SELECT tg_user_id,
                  COUNT(*) FILTER (WHERE event_type = 'message') AS message_count,
                  COUNT(*) FILTER (WHERE event_type = 'reaction') AS reaction_count
           FROM activity_events
           WHERE org_id = $1 AND tg_chat_id = 0
             AND event_type IN ('message', 'reaction')
             AND created_at >= $2
             AND tg_user_id IS NOT NULL
           GROUP BY tg_user_id
           ORDER BY COUNT(*) DESC
           LIMIT $3`,
          [orgId, startIso, topN]
        );
        if (err) {
          logger.error({ error: err.message }, 'Error fetching whatsapp contributors');
        } else {
          rows?.forEach(r => {
            const uid = Number(r.tg_user_id);
            if (!userCounts[uid]) userCounts[uid] = { message_count: 0, reaction_count: 0, tg_user_id: uid };
            userCounts[uid].message_count += Number(r.message_count) || 0;
            userCounts[uid].reaction_count += Number(r.reaction_count) || 0;
          });
        }
      })());
    }

    await Promise.all(queries);

    const sortedEntries = Object.values(userCounts)
      .sort((a, b) => (b.message_count + b.reaction_count) - (a.message_count + a.reaction_count))
      .slice(0, topN);

    // Enrich ALL top contributors from participants table (single query)
    const tgUserIdsToEnrich = sortedEntries.map(data => data.tg_user_id);
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

    const sorted = sortedEntries
      .map((data) => {
        const enriched = participantNames[data.tg_user_id];
        return {
          tg_user_id: data.tg_user_id,
          participant_id: enriched?.participant_id || null,
          message_count: data.message_count,
          reaction_count: data.reaction_count,
          activity_count: data.message_count + data.reaction_count,
          username: enriched?.username || null,
          full_name: enriched?.full_name || null,
          tg_first_name: null,
          tg_last_name: null,
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
