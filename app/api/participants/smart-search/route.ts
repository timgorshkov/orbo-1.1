import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'
import { getOrgBillingStatus } from '@/lib/services/billingService'
import { createAPILogger } from '@/lib/logger'
import openai from '@/lib/services/openaiClient'

/**
 * POST /api/participants/smart-search
 * Body: { orgId: string, query: string }
 *
 * FREE / базовый: PostgreSQL full-text search по всем текстовым полям профиля.
 * PRO: семантический AI-поиск через gpt-4o-mini — находит по смыслу, даже без совпадения слов.
 * Учитывает профиль того, кто ищет (для уточнения контекста).
 */

type ParticipantRow = {
  id: string
  full_name: string | null
  username: string | null
  bio: string | null
  photo_url: string | null
  custom_attributes: Record<string, unknown> | null
  goals_self: string | null
  offers: string | null
  interests_keywords: string | null
  behavioral_role: string | null
  rank?: number
}

type AiResult = { id: string; reason: string }

// Compact one-line profile for AI prompt (~30-50 tokens per participant)
function buildProfileText(p: ParticipantRow): string {
  const name = p.full_name || p.username || 'Участник'
  const handle = p.username ? ` (@${p.username})` : ''
  const ca = (p.custom_attributes as Record<string, unknown>) || {}

  const raw = (key: string) => {
    const v = ca[key]
    if (!v) return null
    if (Array.isArray(v)) return v.join(', ')
    return String(v)
  }

  const fields = [
    p.bio,
    raw('goals_self'),
    raw('bio_custom'),
    raw('offers'),
    raw('asks'),
    raw('interests_keywords'),
    raw('behavioral_role'),
    raw('topics_discussed'),
    raw('city_confirmed') || raw('city_inferred'),
  ]
    .filter(Boolean)
    .join(' | ')

  return `[${p.id}] ${name}${handle}${fields ? ' · ' + fields : ''}`
}

// ── FTS path ─────────────────────────────────────────────────────────────────

async function ftsSearch(
  db: ReturnType<typeof createAdminServer>,
  orgId: string,
  query: string
): Promise<{ results: ParticipantRow[]; error?: string }> {
  const { data, error } = await db.raw(
    `
    SELECT
      p.id,
      p.full_name,
      p.username                                  AS username,
      p.bio,
      p.photo_url,
      p.custom_attributes,
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
      AND (p.participant_status IS NULL OR p.participant_status != 'excluded')
      AND to_tsvector('simple',
            COALESCE(p.full_name,   '') || ' ' ||
            COALESCE(p.username,    '') || ' ' ||
            COALESCE(p.bio,         '') || ' ' ||
            COALESCE(p.custom_attributes::text, '')
          ) @@ plainto_tsquery('simple', $2)
    ORDER BY rank DESC
    LIMIT 8
    `,
    [orgId, query]
  )

  if (error) return { results: [], error: error.message }
  return { results: (data as ParticipantRow[]) ?? [] }
}

// ── AI path ───────────────────────────────────────────────────────────────────

async function aiSearch(
  db: ReturnType<typeof createAdminServer>,
  orgId: string,
  query: string,
  searcherUserId: string,
  logger: ReturnType<typeof createAPILogger>
): Promise<{ results: ParticipantRow[]; explanations: Record<string, string>; error?: string }> {
  // 1. Fetch searcher's participant profile for context
  const { data: searcherRows } = await db.raw(
    `SELECT full_name, username, bio, custom_attributes
     FROM participants
     WHERE org_id = $1 AND user_id = $2 AND merged_into IS NULL
     LIMIT 1`,
    [orgId, searcherUserId]
  )
  const searcher = (searcherRows as ParticipantRow[] | null)?.[0] ?? null
  const searcherText = searcher
    ? buildProfileText({ ...searcher, id: 'searcher', photo_url: null })
    : null

  // 2. Fetch all active participants (limit 300, most recently active first)
  const { data: allRows, error: fetchErr } = await db.raw(
    `SELECT
       p.id, p.full_name, p.username, p.bio, p.photo_url, p.custom_attributes,
       p.custom_attributes->>'goals_self'         AS goals_self,
       p.custom_attributes->>'offers'             AS offers,
       p.custom_attributes->>'interests_keywords' AS interests_keywords,
       p.custom_attributes->>'behavioral_role'    AS behavioral_role
     FROM participants p
     WHERE p.org_id = $1
       AND p.merged_into IS NULL
       AND (p.participant_status IS NULL OR p.participant_status != 'excluded')
     ORDER BY p.last_activity_at DESC NULLS LAST
     LIMIT 300`,
    [orgId]
  )

  if (fetchErr) return { results: [], explanations: {}, error: fetchErr.message }

  const participants = (allRows as ParticipantRow[]) ?? []
  if (participants.length === 0) return { results: [], explanations: {} }

  // 3. Build compact profile list
  const profileList = participants.map(buildProfileText).join('\n')

  // 4. Call gpt-4o-mini
  const systemPrompt = `Ты — система умного поиска участников профессионального сообщества.
Твоя задача: по поисковому запросу найти до 8 наиболее релевантных участников из предоставленного списка.

Ищи по СМЫСЛУ, а не по точному совпадению слов. Примеры:
- "провожу конференции для девелоперов" релевантен запросу "кто работает с разработчиками"
- "строю дома" релевантен запросу "застройщик"
- "обучаю продажам" релевантен запросу "тренер по бизнесу"

Верни строго валидный JSON без лишних символов:
{"results":[{"id":"UUID участника","reason":"1 предложение на русском — почему этот человек подходит"},...]}

Если нет подходящих — верни {"results":[]}.`

  const userPrompt = [
    `ЗАПРОС: ${query}`,
    searcherText ? `\nПРОФИЛЬ ТОГО, КТО ИЩЕТ (контекст):\n${searcherText}` : '',
    `\nСПИСОК УЧАСТНИКОВ (${participants.length} чел.):\n${profileList}`,
  ]
    .filter(Boolean)
    .join('\n')

  let aiResults: AiResult[] = []
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 800,
    })

    const raw = completion.choices[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(raw)
    aiResults = Array.isArray(parsed.results) ? parsed.results : []

    logger.info(
      {
        org_id: orgId,
        query,
        participants_sent: participants.length,
        results_returned: aiResults.length,
        tokens: completion.usage?.total_tokens,
      },
      'AI smart search completed'
    )
  } catch (aiErr) {
    logger.error(
      { error: aiErr instanceof Error ? aiErr.message : String(aiErr) },
      'AI smart search call failed'
    )
    return { results: [], explanations: {}, error: 'AI request failed' }
  }

  // 5. Map AI result IDs back to full participant rows
  const idSet = new Set(aiResults.map((r) => r.id))
  const explanations: Record<string, string> = {}
  aiResults.forEach((r) => {
    explanations[r.id] = r.reason
  })

  // Preserve AI ranking order
  const resultRows = aiResults
    .map((r) => participants.find((p) => p.id === r.id))
    .filter((p): p is ParticipantRow => !!p && idSet.has(p.id))

  return { results: resultRows, explanations }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: 'participants/smart-search' })

  try {
    const { orgId, query } = await request.json()

    if (!orgId || !query?.trim()) {
      return NextResponse.json({ error: 'Missing orgId or query' }, { status: 400 })
    }
    const cleanQuery = (query as string).trim()
    if (cleanQuery.length < 2) {
      return NextResponse.json({ error: 'Query too short' }, { status: 400 })
    }

    const user = await getUnifiedUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const role = await getEffectiveOrgRole(user.id, orgId)
    if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const db = createAdminServer()

    // Check PRO plan
    const billing = await getOrgBillingStatus(orgId)
    const isPro = billing.plan.limits.ai_requests_per_month === -1

    if (isPro) {
      const { results, explanations, error } = await aiSearch(db, orgId, cleanQuery, user.id, logger)

      if (error) {
        // Graceful fallback to FTS on AI failure
        logger.warn({ error }, 'AI search failed, falling back to FTS')
        const fts = await ftsSearch(db, orgId, cleanQuery)
        return NextResponse.json({
          results: fts.results,
          mode: 'fts',
          fallback: true,
        })
      }

      return NextResponse.json({ results, explanations, mode: 'ai' })
    }

    // FTS for non-PRO
    const { results, error } = await ftsSearch(db, orgId, cleanQuery)
    if (error) {
      logger.error({ error, query: cleanQuery }, 'FTS search failed')
      return NextResponse.json({ error: 'Search failed' }, { status: 500 })
    }

    logger.info({ org_id: orgId, query: cleanQuery, results: results.length }, 'FTS search')
    return NextResponse.json({ results, mode: 'fts' })
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      'Smart search error'
    )
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
