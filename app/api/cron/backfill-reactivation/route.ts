/**
 * POST /api/cron/backfill-reactivation
 *
 * One-time (idempotent) campaign: schedules reactivation_connect message
 * for existing users who:
 *   1. Have created an organization (are an owner)
 *   2. Have NOT connected a Telegram account OR have no Telegram group
 *   3. Have NOT already received/scheduled reactivation_connect
 *   4. Have NOT blocked the bot or unsubscribed (no permanent-fail record)
 *
 * Safe to call multiple times — uses INSERT ... WHERE NOT EXISTS, so
 * already-scheduled users are skipped automatically.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createCronLogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const REACTIVATION_KEY = 'reactivation_connect'
// Schedule first batch 30 min from now, spread subsequent batches to avoid
// hammering the email/TG APIs simultaneously.
const INITIAL_DELAY_MIN = 30

export async function POST(request: NextRequest) {
  const logger = createCronLogger('backfill-reactivation')

  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    logger.warn('Unauthorized call attempt')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const db = createAdminServer()

    // -----------------------------------------------------------------------
    // 1. Find candidates: owners with org who haven't completed setup
    // -----------------------------------------------------------------------
    // Raw SQL: join users + memberships + accounts + org_telegram_groups,
    // filter by missing TG or missing group, exclude already scheduled.
    const { data: candidates, error: qErr } = await db.raw<{
      user_id: string
      tg_user_id: number | null
      tg_oauth_id: string | null
      group_count: number
      channel: string
    }>(`
      SELECT DISTINCT ON (u.id)
        u.id                        AS user_id,
        u.tg_user_id                AS tg_user_id,
        a.provider_account_id       AS tg_oauth_id,
        COALESCE(g.group_count, 0)  AS group_count,
        CASE
          WHEN a.provider_account_id IS NOT NULL OR u.tg_user_id IS NOT NULL THEN 'telegram'
          ELSE 'email'
        END                         AS channel
      FROM users u
      JOIN memberships m ON m.user_id = u.id AND m.role = 'owner'
      LEFT JOIN accounts a
        ON a.user_id = u.id AND a.provider = 'telegram'
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS group_count
        FROM org_telegram_groups otg
        WHERE otg.org_id = m.org_id
      ) g ON true
      WHERE
        -- missing TG account or missing group
        (
          (a.provider_account_id IS NULL AND u.tg_user_id IS NULL)
          OR COALESCE(g.group_count, 0) = 0
        )
        -- not already scheduled or sent
        AND NOT EXISTS (
          SELECT 1 FROM onboarding_messages om
          WHERE om.user_id = u.id AND om.step_key = $1
        )
        -- not blocked / unsubscribed (any channel)
        AND NOT EXISTS (
          SELECT 1 FROM onboarding_messages om
          WHERE om.user_id = u.id
            AND om.status = 'failed'
            AND (
              om.error ILIKE '%blocked%'
              OR om.error ILIKE '%unsubscribed%'
              OR om.error ILIKE '%deactivated%'
              OR om.error ILIKE '%chat not found%'
            )
        )
      ORDER BY u.id, m.created_at DESC
      LIMIT 500
    `, [REACTIVATION_KEY])

    if (qErr) {
      logger.error({ error: qErr.message }, 'Candidate query failed')
      return NextResponse.json({ error: qErr.message }, { status: 500 })
    }

    if (!candidates || candidates.length === 0) {
      logger.info('No candidates found — backfill complete or nothing to do')
      return NextResponse.json({ success: true, scheduled: 0 })
    }

    logger.info({ count: candidates.length }, 'Candidates found, scheduling reactivation messages')

    // -----------------------------------------------------------------------
    // 2. Insert reactivation_connect rows for each candidate
    //    Stagger send time: batch of 10 per minute to avoid API bursts
    // -----------------------------------------------------------------------
    const now = Date.now()
    const rows = candidates.map((c, i) => {
      // Determine channel:
      //  - email chain users (no TG OAuth, no tg_user_id) → 'email'
      //  - telegram/max chain users → 'telegram' (they can receive TG message)
      const channel = (c.tg_oauth_id || c.tg_user_id) ? 'telegram' : 'email'
      const batchDelayMs = Math.floor(i / 10) * 60 * 1000 // stagger by 1 min per 10 users
      const scheduledAt = new Date(now + INITIAL_DELAY_MIN * 60 * 1000 + batchDelayMs).toISOString()
      return {
        user_id: c.user_id,
        step_key: REACTIVATION_KEY,
        channel,
        status: 'pending',
        scheduled_at: scheduledAt,
      }
    })

    const { error: insertErr } = await db
      .from('onboarding_messages')
      .upsert(rows, { onConflict: 'user_id,step_key,channel', ignoreDuplicates: true })

    if (insertErr) {
      logger.error({ error: insertErr.message }, 'Failed to insert reactivation rows')
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    logger.info({ scheduled: rows.length }, 'Reactivation backfill complete')
    return NextResponse.json({ success: true, scheduled: rows.length })
  } catch (err: any) {
    logger.error({ error: err.message, stack: err.stack }, 'Backfill reactivation failed')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
