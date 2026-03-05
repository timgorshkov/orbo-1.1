import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'
import { createAPILogger } from '@/lib/logger'

/**
 * POST /api/participants/smart-search
 * Body: { orgId: string, query: string }
 *
 * Умный поиск участников по всем полям профиля (bio, goals, offers, asks,
 * interests_keywords, topics_discussed, behavioral_role, custom_attributes)
 * через PostgreSQL full-text search с ранжированием по релевантности.
 */
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: 'participants/smart-search' })

  try {
    const { orgId, query } = await request.json()

    if (!orgId || !query?.trim()) {
      return NextResponse.json({ error: 'Missing orgId or query' }, { status: 400 })
    }

    const cleanQuery = query.trim()
    if (cleanQuery.length < 2) {
      return NextResponse.json({ error: 'Query too short' }, { status: 400 })
    }

    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const role = await getEffectiveOrgRole(user.id, orgId)
    if (!role) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const db = createAdminServer()

    // Строим поисковый вектор из всех текстовых полей профиля.
    // custom_attributes::text включает все JSON-значения (goals_self, offers, asks,
    // bio_custom, interests_keywords, behavioral_role, topics_discussed и т.д.)
    // plainto_tsquery безопасен для произвольного пользовательского ввода.
    const { data, error } = await db.raw(`
      SELECT
        p.id,
        p.full_name,
        p.username                                  AS tg_username,
        p.bio,
        p.photo_url,
        p.custom_attributes->>'goals_self'          AS goals_self,
        p.custom_attributes->>'offers'              AS offers,
        p.custom_attributes->>'interests_keywords'  AS interests_keywords,
        p.custom_attributes->>'behavioral_role'     AS behavioral_role,
        ts_rank(
          to_tsvector('simple',
            COALESCE(p.full_name,   '') || ' ' ||
            COALESCE(p.username,    '') || ' ' ||
            COALESCE(p.bio,         '') || ' ' ||
            COALESCE(p.custom_attributes::text, '')
          ),
          plainto_tsquery('simple', $2)
        ) AS rank
      FROM participants p
      WHERE
        p.org_id = $1
        AND p.merged_into IS NULL
        AND (p.participant_status IS NULL OR p.participant_status != 'archived')
        AND to_tsvector('simple',
              COALESCE(p.full_name,   '') || ' ' ||
              COALESCE(p.username,    '') || ' ' ||
              COALESCE(p.bio,         '') || ' ' ||
              COALESCE(p.custom_attributes::text, '')
            ) @@ plainto_tsquery('simple', $2)
      ORDER BY rank DESC
      LIMIT 8
    `, [orgId, cleanQuery])

    if (error) {
      logger.error({ error: error.message, query: cleanQuery }, 'Smart search query failed')
      return NextResponse.json({ error: 'Search failed' }, { status: 500 })
    }

    logger.info({
      org_id: orgId,
      query: cleanQuery,
      results: (data as any[])?.length ?? 0,
    }, 'Smart search executed')

    return NextResponse.json({ results: data ?? [] })
  } catch (err) {
    const logger = createAPILogger(request, { endpoint: 'participants/smart-search' })
    logger.error({ error: err instanceof Error ? err.message : String(err) }, 'Smart search error')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
