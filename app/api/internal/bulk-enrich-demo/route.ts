/**
 * Internal one-time endpoint for bulk AI enrichment (demo prep).
 *
 * Processes a batch of participants for an org, running the same AI enrichment
 * as clicking "Запустить анализ" in the UI, but WITHOUT credit deduction or audit logging.
 *
 * Usage (on server):
 *   curl -s -X POST https://my.orbo.ru/api/internal/bulk-enrich-demo \
 *     -H "Authorization: Bearer $CRON_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"orgId":"...", "offset":0, "batchSize":10}'
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { enrichParticipant } from '@/lib/services/participantEnrichmentService';

const MIN_MESSAGES = 2;

async function getEligibleParticipants(
  orgId: string,
  offset: number,
  batchSize: number
): Promise<Array<{ id: string; full_name: string }>> {
  const db = createAdminServer();

  const { data: tgGroups } = await db
    .from('org_telegram_groups')
    .select('tg_chat_id')
    .eq('org_id', orgId);

  const chatIds = (tgGroups || []).map(g => Number(g.tg_chat_id));

  const result = await db.raw<{ id: string; full_name: string }[]>(`
    SELECT p.id, p.full_name
    FROM participants p
    JOIN activity_events ae
      ON ae.tg_user_id = p.tg_user_id
      AND ae.event_type = 'message'
      AND (
        ae.tg_chat_id = ANY($2::bigint[])
        OR (ae.tg_chat_id = 0 AND ae.org_id = $1)
      )
    WHERE p.org_id = $1
      AND p.merged_into IS NULL
      AND p.tg_user_id IS NOT NULL
      AND (p.custom_attributes->>'last_enriched_at') IS NULL
    GROUP BY p.id, p.full_name
    HAVING COUNT(ae.id) >= ${MIN_MESSAGES}
    ORDER BY COUNT(ae.id) DESC
    LIMIT $3 OFFSET $4
  `, [orgId, chatIds, batchSize, offset]);

  return result.data || [];
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let orgId: string, offset: number, batchSize: number;
  try {
    const body = await req.json();
    orgId = body.orgId;
    offset = body.offset ?? 0;
    batchSize = body.batchSize ?? 10;
    if (!orgId) throw new Error('Missing orgId');
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }

  const participants = await getEligibleParticipants(orgId, offset, batchSize);

  const results = [];
  for (const p of participants) {
    const start = Date.now();
    try {
      const result = await enrichParticipant(
        p.id,
        orgId,
        { useAI: true, includeBehavior: true, includeReactions: true, daysBack: 180 },
        null
      );
      results.push({
        id: p.id,
        name: p.full_name,
        success: result.success,
        interests: result.ai_analysis?.interests?.length ?? 0,
        asks: result.ai_analysis?.asks?.length ?? 0,
        cost_usd: result.cost_usd,
        duration_ms: result.duration_ms,
        error: result.error,
      });
    } catch (err: unknown) {
      results.push({
        id: p.id,
        name: p.full_name,
        success: false,
        error: String(err),
        duration_ms: Date.now() - start,
      });
    }
  }

  return NextResponse.json({
    orgId,
    offset,
    batchSize,
    processed: results.length,
    hasMore: results.length === batchSize,
    results,
  });
}
