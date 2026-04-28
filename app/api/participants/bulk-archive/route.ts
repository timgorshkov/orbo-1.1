/**
 * POST /api/participants/bulk-archive
 *
 * Mass-archive participants. Two modes:
 *   - explicit IDs: { orgId, ids: ['uuid', ...] }
 *   - filter:       { orgId, mode: 'not_in_any_active_group' }
 *
 * "not_in_any_active_group" archives every participant in the org who:
 *   • is not currently linked to any of the org's groups (no participant_groups
 *     row with left_at IS NULL); AND
 *   • has no upcoming/active event registrations; AND
 *   • has no active membership/subscription.
 * After running the periodic reconcile (which fills left_at for those who
 * left every group) this filter cleanly captures the long-tail of historical
 * imports + lurkers that no longer belong to any tracked entity.
 *
 * Use { dryRun: true } to preview the count + first 50 candidates without
 * mutating anything.
 *
 * Auth: org owner / admin (including virtual owner via superadmin).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'
import { createAPILogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

type Mode = 'not_in_any_active_group'

export async function POST(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: '/api/participants/bulk-archive' })

  const user = await getUnifiedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const orgId = body.orgId as string | undefined
    const mode = body.mode as Mode | undefined
    const ids = Array.isArray(body.ids) ? (body.ids as string[]) : undefined
    const dryRun = body.dryRun === true

    if (!orgId) return NextResponse.json({ error: 'orgId is required' }, { status: 400 })
    if (!ids?.length && !mode) {
      return NextResponse.json({ error: 'Either ids[] or mode must be provided' }, { status: 400 })
    }

    const access = await getEffectiveOrgRole(user.id, orgId)
    if (!access || (access.role !== 'owner' && access.role !== 'admin')) {
      return NextResponse.json({ error: 'Forbidden: owner/admin required' }, { status: 403 })
    }

    const db = createAdminServer()

    // Resolve target IDs from mode
    let targetIds: string[] = ids || []
    if (!ids?.length && mode === 'not_in_any_active_group') {
      // Participant qualifies for archiving if:
      //  - belongs to this org
      //  - is canonical (merged_into IS NULL)
      //  - is not already excluded
      //  - has NO active group link (in any of the org's groups)
      //  - has NO active event registration (status IN registered/attended/paid)
      //  - has NO active membership
      const { data: rows, error } = await db.raw(
        `SELECT p.id
           FROM participants p
          WHERE p.org_id = $1
            AND p.merged_into IS NULL
            AND (p.participant_status IS NULL OR p.participant_status != 'excluded')
            AND NOT EXISTS (
              SELECT 1 FROM participant_groups pg
               JOIN org_telegram_groups otg ON otg.tg_chat_id = pg.tg_group_id
              WHERE pg.participant_id = p.id
                AND otg.org_id = $1
                AND pg.left_at IS NULL
            )
            AND NOT EXISTS (
              SELECT 1 FROM event_registrations er
              WHERE er.participant_id = p.id
                AND er.status IN ('registered', 'attended')
            )
            AND NOT EXISTS (
              SELECT 1 FROM participant_memberships pm
              WHERE pm.participant_id = p.id
                AND pm.status IN ('active', 'trial')
            )`,
        [orgId]
      )
      if (error) {
        logger.error({ org_id: orgId, error: error.message }, 'Failed to resolve archive candidates')
        return NextResponse.json({ error: 'Query failed' }, { status: 500 })
      }
      targetIds = (rows || []).map((r: any) => r.id)
    } else if (ids?.length) {
      // Explicit IDs: ensure they belong to this org and aren't already excluded.
      const { data: rows, error } = await db.raw(
        `SELECT id
           FROM participants
          WHERE org_id = $1
            AND id = ANY($2::uuid[])
            AND merged_into IS NULL
            AND (participant_status IS NULL OR participant_status != 'excluded')`,
        [orgId, ids]
      )
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      targetIds = (rows || []).map((r: any) => r.id)
    }

    const totalCandidates = targetIds.length

    if (dryRun) {
      // Return a small preview so the UI can show "X to be archived, e.g. ..."
      const previewIds = targetIds.slice(0, 50)
      const { data: preview } = previewIds.length
        ? await db.raw(
            `SELECT id, full_name, username, tg_user_id, source, created_at
               FROM participants
              WHERE id = ANY($1::uuid[])
              ORDER BY created_at ASC
              LIMIT 50`,
            [previewIds]
          )
        : { data: [] as any[] }
      return NextResponse.json({
        dryRun: true,
        totalCandidates,
        previewCount: (preview || []).length,
        preview: preview || [],
      })
    }

    if (totalCandidates === 0) {
      return NextResponse.json({ archived: 0 })
    }

    // Archive in chunks to keep parameter lists small for big orgs.
    const CHUNK = 500
    let archived = 0
    for (let i = 0; i < targetIds.length; i += CHUNK) {
      const chunk = targetIds.slice(i, i + CHUNK)
      const { data: updated, error: updErr } = await db.raw(
        `UPDATE participants
            SET participant_status = 'excluded',
                deleted_at = NOW(),
                updated_at = NOW()
          WHERE id = ANY($1::uuid[])
            AND (participant_status IS NULL OR participant_status != 'excluded')
        RETURNING id`,
        [chunk]
      )
      if (updErr) {
        logger.error({ org_id: orgId, error: updErr.message }, 'Bulk archive update failed (partial)')
        return NextResponse.json({ error: updErr.message, archivedSoFar: archived }, { status: 500 })
      }
      archived += (updated || []).length
    }

    logger.info({
      org_id: orgId,
      mode: mode || 'explicit_ids',
      requested: ids?.length || null,
      candidates: totalCandidates,
      archived,
      by: user.id,
    }, 'Bulk archive completed')

    return NextResponse.json({ archived, candidates: totalCandidates, mode: mode || 'explicit_ids' })
  } catch (err: any) {
    logger.error({ error: err?.message }, 'bulk-archive failed')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
