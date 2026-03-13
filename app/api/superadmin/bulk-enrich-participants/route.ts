/**
 * Superadmin: Bulk AI Enrichment for Org Participants
 *
 * POST /api/superadmin/bulk-enrich-participants
 * Body: { orgId, minMessages?, daysBack?, limit? }
 *
 * Auth: Authorization: Bearer {CRON_SECRET}  (or superadmin session)
 *
 * Runs AI analysis for all participants in an org who have >= minMessages messages.
 * Bypasses billing checks — intended for manual superadmin use only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { enrichParticipant } from '@/lib/services/participantEnrichmentService';
import { createServiceLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
// Long timeout: up to 10 min (many participants × ~5–10 s each)
export const maxDuration = 600;

const logger = createServiceLogger('BulkEnrichParticipants');

function verifyAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  const host = request.headers.get('host');
  if (host?.includes('localhost') || host?.includes('127.0.0.1')) return true;
  return false;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const {
    orgId,
    minMessages = 5,
    daysBack = 90,
    limit = 200,
  } = body as {
    orgId: string;
    minMessages?: number;
    daysBack?: number;
    limit?: number;
  };

  if (!orgId) {
    return NextResponse.json({ error: 'orgId required' }, { status: 400 });
  }

  const db = createAdminServer();
  const startTime = Date.now();

  logger.info({ org_id: orgId, min_messages: minMessages, days_back: daysBack, limit }, 'Starting bulk AI enrichment');

  // ── 1. Get participants with enough messages ──────────────────────────────
  // participant_messages has a direct participant_id FK → cleanest count query
  const { data: qualifying, error: queryError } = await db.raw(
    `SELECT p.id, p.full_name, COUNT(pm.id)::int AS message_count
     FROM participants p
     JOIN participant_messages pm ON pm.participant_id = p.id
     WHERE p.org_id = $1
       AND p.merged_into IS NULL
     GROUP BY p.id, p.full_name
     HAVING COUNT(pm.id) >= $2
     ORDER BY message_count DESC
     LIMIT $3`,
    [orgId, minMessages, limit]
  );

  if (queryError) {
    logger.error({ error: queryError }, 'Failed to query qualifying participants');
    return NextResponse.json({ error: String(queryError) }, { status: 500 });
  }

  const participants = (qualifying || []) as Array<{ id: string; full_name: string | null; message_count: number }>;
  logger.info({ count: participants.length }, 'Qualifying participants found');

  if (participants.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      success: 0,
      failed: 0,
      totalCostUsd: 0,
      durationMs: Date.now() - startTime,
      message: `No participants with >= ${minMessages} messages found`,
    });
  }

  // ── 2. Enrich each participant sequentially ───────────────────────────────
  const stats = { success: 0, failed: 0, totalCostUsd: 0 };
  const errors: Array<{ participantId: string; name: string | null; error: string }> = [];

  for (let i = 0; i < participants.length; i++) {
    const p = participants[i];
    logger.info({ index: i + 1, total: participants.length, participant_id: p.id, name: p.full_name, message_count: p.message_count }, 'Enriching participant');

    try {
      const result = await enrichParticipant(
        p.id,
        orgId,
        { useAI: true, includeBehavior: true, includeReactions: true, daysBack },
        null // no user id — system operation
      );

      if (result.success) {
        stats.success++;
        stats.totalCostUsd += result.cost_usd || 0;
        logger.info({ participant_id: p.id, name: p.full_name, cost_usd: result.cost_usd, messages: result.messages_analyzed }, 'Enriched OK');
      } else {
        stats.failed++;
        errors.push({ participantId: p.id, name: p.full_name, error: result.error || 'unknown' });
        logger.warn({ participant_id: p.id, name: p.full_name, error: result.error }, 'Enrichment returned failure');
      }
    } catch (err) {
      stats.failed++;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ participantId: p.id, name: p.full_name, error: msg });
      logger.error({ participant_id: p.id, name: p.full_name, error: msg }, 'Enrichment threw error');
    }

    // Небольшая пауза между запросами, чтобы не перегрузить OpenAI
    if (i < participants.length - 1) {
      await sleep(1500);
    }
  }

  const durationMs = Date.now() - startTime;

  logger.info({
    org_id: orgId,
    processed: participants.length,
    success: stats.success,
    failed: stats.failed,
    total_cost_usd: stats.totalCostUsd,
    duration_ms: durationMs,
  }, 'Bulk enrichment complete');

  return NextResponse.json({
    ok: true,
    processed: participants.length,
    success: stats.success,
    failed: stats.failed,
    totalCostUsd: Number(stats.totalCostUsd.toFixed(4)),
    durationMs,
    errors: errors.length > 0 ? errors : undefined,
  });
}
