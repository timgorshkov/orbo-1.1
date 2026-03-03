import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'

export const dynamic = 'force-dynamic'

/**
 * GET /api/participants/enriched?orgId=xxx
 *
 * Returns all enriched participants for an org via the same RPC used on the
 * server-rendered members page.  Called in the background by MembersView when
 * the server only returned the first N participants for a fast initial render.
 */
export async function GET(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'participants/enriched' })

  try {
    const url = new URL(req.url)
    const orgId = url.searchParams.get('orgId')

    if (!orgId) {
      return NextResponse.json({ error: 'orgId required' }, { status: 400 })
    }

    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const access = await getEffectiveOrgRole(user.id, orgId)
    if (!access) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const isAdmin = access.role === 'owner' || access.role === 'admin'
    const adminSupabase = createAdminServer()

    let participants: any[] = []

    try {
      const { data, error } = await adminSupabase.rpc('get_enriched_participants', {
        p_org_id: orgId,
        p_include_tags: isAdmin,
      })

      if (error) throw error

      participants = (data || []).map((p: any) => {
        const lastMsg = p.last_message_at ? new Date(p.last_message_at).getTime() : 0
        const lastAct = p.last_activity_at ? new Date(p.last_activity_at).getTime() : 0
        const latestActivity =
          lastMsg > lastAct ? p.last_message_at : p.last_activity_at || p.last_message_at

        return {
          ...p,
          is_org_owner: p.is_org_owner,
          is_group_creator: p.is_group_creator,
          is_admin: p.is_org_admin || p.is_group_admin,
          is_owner: p.is_org_owner,
          tags: p.tags || [],
          real_join_date: p.first_message_at || p.created_at,
          real_last_activity: latestActivity,
          activity_score: p.activity_score || 0,
          first_message_at: p.first_message_at,
        }
      })

      participants.sort((a: any, b: any) => {
        const aTime = a.real_last_activity ? new Date(a.real_last_activity).getTime() : 0
        const bTime = b.real_last_activity ? new Date(b.real_last_activity).getTime() : 0
        return bTime - aTime
      })
    } catch {
      // Fallback: simple query without enrichment
      const { data, error } = await adminSupabase
        .from('participants')
        .select('*')
        .eq('org_id', orgId)
        .neq('participant_status', 'excluded')
        .is('merged_into', null)
        .order('last_activity_at', { ascending: false, nullsFirst: true })

      if (error) throw error
      participants = (data || []).map((p: any) => ({
        ...p,
        tags: [],
        is_admin: false,
        is_org_owner: false,
        is_owner: false,
        real_join_date: p.created_at,
        real_last_activity: p.last_activity_at,
        activity_score: 0,
      }))
    }

    logger.debug({ org_id: orgId, count: participants.length }, 'Enriched participants fetched')

    return NextResponse.json({ participants })
  } catch (error: any) {
    logger.error({ error: error?.message }, 'Error fetching enriched participants')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
