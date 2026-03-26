/**
 * POST /api/participant-auth/set-session
 * Accepts a pre-validated participant JWT, sets it as a cookie, returns JSON.
 * Called via fetch() from the magic-link landing page — setting a cookie on a
 * fetch response is reliable in all browsers, unlike setting it on a redirect.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyParticipantToken } from '@/lib/participant-auth/session'
import { createAPILogger } from '@/lib/logger'

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'participant-auth/set-session' })

  try {
    const { token } = await req.json()
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'token required' }, { status: 400 })
    }

    const session = verifyParticipantToken(token)
    if (!session) {
      logger.warn({}, 'set-session: invalid or expired token')
      return NextResponse.json({ error: 'invalid token' }, { status: 401 })
    }

    logger.info({ participant_id: session.participantId, org_id: session.orgId }, 'set-session: cookie set')

    const response = NextResponse.json({ ok: true })
    response.cookies.set('participant_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    })
    return response
  } catch (err: any) {
    logger.error({ error: err.message }, 'set-session error')
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}
