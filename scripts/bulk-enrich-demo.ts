/**
 * Bulk AI enrichment script for demo preparation.
 *
 * Finds all participants with 2+ messages in the specified organizations
 * and runs AI enrichment (same logic as clicking "AI-анализ" in the UI),
 * WITHOUT decrementing credits or writing to audit log.
 *
 * Usage (on server or locally with .env.local):
 *   npx tsx --tsconfig tsconfig.json scripts/bulk-enrich-demo.ts
 *
 * Or with dotenv-cli:
 *   npx dotenv -e .env.local -- npx tsx --tsconfig tsconfig.json scripts/bulk-enrich-demo.ts
 */

import { enrichParticipant } from '../lib/services/participantEnrichmentService';
import { createAdminServer } from '../lib/server/supabaseServer';

// ── Config ────────────────────────────────────────────────────────────────────

// Full org UUIDs
const ORG_SLUGS = [
  '79841ac4-6a6f-4b51-8557-d787dcc92fce', // WorkNet
  '9a38ac06-1474-49db-b9bb-a263bdf94de9',  // Реальные маркетологи
  '141896fc-c6a7-466c-9303-838a6d89106c',  // Дела и разговоры. Клуб директоров
];

const MIN_MESSAGES = 2;
const DELAY_MS = 1500;       // delay between participants to avoid OpenAI rate limits
const DAYS_BACK = 180;
const SKIP_ALREADY_ENRICHED = true; // skip participants that already have last_enriched_at

// ─────────────────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function resolveOrgIds(slugs: string[]): Promise<string[]> {
  const db = createAdminServer();
  const ids: string[] = [];

  for (const slug of slugs) {
    const { data, error } = await db
      .from('organizations')
      .select('id, name')
      .eq('id', slug)
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      console.error(`❌ Could not find org: "${slug}" — ${error?.message}`);
      continue;
    }
    console.log(`✅ Org: ${data.name} (${data.id})`);
    ids.push(data.id);
  }

  return ids;
}

async function getParticipantsWithMessages(orgId: string): Promise<Array<{ id: string; full_name: string; message_count: number }>> {
  const db = createAdminServer();

  // Get Telegram chat IDs for this org (same as enrichParticipant uses)
  const { data: tgGroups } = await db
    .from('org_telegram_groups')
    .select('tg_chat_id')
    .eq('org_id', orgId);

  const chatIds = (tgGroups || []).map(g => Number(g.tg_chat_id));

  if (chatIds.length === 0) {
    console.log(`  ⚠️  No connected Telegram groups for org ${orgId}`);
  }

  const skipClause = SKIP_ALREADY_ENRICHED
    ? `AND (p.custom_attributes->>'last_enriched_at') IS NULL`
    : '';

  const result = await db.raw<{ id: string; full_name: string; message_count: string }[]>(`
    SELECT
      p.id,
      p.full_name,
      COUNT(ae.id)::text AS message_count
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
      ${skipClause}
    GROUP BY p.id, p.full_name
    HAVING COUNT(ae.id) >= ${MIN_MESSAGES}
    ORDER BY COUNT(ae.id) DESC
  `, [orgId, chatIds]);

  if (!result.data) return [];

  return result.data.map(row => ({
    id: row.id,
    full_name: row.full_name || '(unnamed)',
    message_count: parseInt(row.message_count, 10),
  }));
}

async function main() {
  console.log('=== Bulk AI Enrichment for Demo ===\n');

  const orgIds = await resolveOrgIds(ORG_SLUGS);

  if (orgIds.length === 0) {
    console.error('No valid org IDs resolved. Aborting.');
    process.exit(1);
  }

  let totalProcessed = 0;
  let totalSuccess = 0;
  let totalFailed = 0;

  for (const orgId of orgIds) {
    console.log(`\n── Organization: ${orgId} ──`);

    const participants = await getParticipantsWithMessages(orgId);
    console.log(`  Found ${participants.length} participants with ${MIN_MESSAGES}+ messages\n`);

    for (let i = 0; i < participants.length; i++) {
      const p = participants[i];
      const label = `[${i + 1}/${participants.length}] ${p.full_name} (${p.message_count} msgs)`;

      process.stdout.write(`  ${label} … `);

      try {
        const result = await enrichParticipant(
          p.id,
          orgId,
          {
            useAI: true,
            includeBehavior: true,
            includeReactions: true,
            daysBack: DAYS_BACK,
          },
          null // no userId — skips audit log inside enrichParticipant
        );

        if (result.success) {
          const interests = result.ai_analysis?.interests?.length ?? 0;
          const asks = result.ai_analysis?.asks?.length ?? 0;
          const cost = result.cost_usd != null ? `$${result.cost_usd.toFixed(4)}` : '';
          console.log(`✅  interests=${interests} asks=${asks} ${cost} (${result.duration_ms}ms)`);
          totalSuccess++;
        } else {
          console.log(`⚠️  success=false error=${result.error}`);
          totalFailed++;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`❌  ${msg}`);
        totalFailed++;
      }

      totalProcessed++;

      // Delay to respect OpenAI rate limits (except after the last item in the org)
      if (i < participants.length - 1) {
        await sleep(DELAY_MS);
      }
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`Total processed: ${totalProcessed}`);
  console.log(`Success: ${totalSuccess}`);
  console.log(`Failed:  ${totalFailed}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
