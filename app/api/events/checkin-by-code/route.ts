/**
 * POST /api/events/checkin-by-code
 * Resolve a short manual-entry code (last 8 hex chars of qr_token) to a full token.
 *
 * Auth: requires a registrator session OR an admin user. The actual /api/events/checkin
 * endpoint enforces the same auth — this endpoint exists to translate a short code
 * to a full token without exposing arbitrary tokens.
 *
 * Returns { token } on success. The client then GETs /api/events/checkin?token=...
 * to fetch ticket details.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getRegistratorSession } from '@/lib/registrator-auth/session'
import { normalizeShortCode, shortCodeToLikePattern } from '@/lib/utils/qrTicket'

export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/events/checkin-by-code' })

  try {
    // Auth: registrator OR admin
    const user = await getUnifiedUser()
    let registratorSession: { orgId: string } | null = null
    if (!user) {
      const reg = await getRegistratorSession()
      if (!reg) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      registratorSession = { orgId: reg.orgId }
    }

    const body = await request.json().catch(() => ({}))
    const code = normalizeShortCode(body.code || '')

    if (code.length !== 8) {
      return NextResponse.json(
        { error: 'Введите 8 символов кода билета' },
        { status: 400 }
      )
    }

    const db = createAdminServer()
    const pattern = shortCodeToLikePattern(code)

    // Look up by short code. If a registrator made the request, scope by their org.
    const sql = registratorSession
      ? `SELECT er.qr_token
           FROM event_registrations er
           JOIN events e ON e.id = er.event_id
          WHERE UPPER(REPLACE(er.qr_token, '-', '')) LIKE $1
            AND e.org_id = $2
          LIMIT 2`
      : `SELECT er.qr_token
           FROM event_registrations er
          WHERE UPPER(REPLACE(er.qr_token, '-', '')) LIKE $1
          LIMIT 2`

    const params = registratorSession ? [pattern, registratorSession.orgId] : [pattern]
    const { data, error } = await db.raw(sql, params)

    if (error) {
      logger.error({ error: error.message }, 'checkin-by-code lookup failed')
      return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: 'Билет с таким кодом не найден' },
        { status: 404 }
      )
    }

    if (data.length > 1) {
      logger.warn({ short_code: code }, 'short code matched multiple tickets')
      return NextResponse.json(
        { error: 'Найдено несколько билетов с таким кодом — попробуйте отсканировать QR' },
        { status: 409 }
      )
    }

    return NextResponse.json({ token: (data[0] as any).qr_token })
  } catch (err) {
    logger.error({ error: String(err) }, 'checkin-by-code error')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
