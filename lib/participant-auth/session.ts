/**
 * Participant session management via signed JWT cookie.
 * Separate from NextAuth — used for public portal participants.
 * Cookie name: participant_session
 */

import crypto from 'crypto'
import { cookies } from 'next/headers'
import { createServiceLogger } from '@/lib/logger'

const COOKIE_NAME = 'participant_session'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

export interface ParticipantSession {
  participantId: string
  orgId: string
  email?: string
  tgUserId?: string
  name?: string
  iat: number
  exp: number
}

function getSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET not configured')
  return secret
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function sign(payload: object): string {
  const header = base64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const body = base64url(Buffer.from(JSON.stringify(payload)))
  const sig = base64url(
    crypto.createHmac('sha256', getSecret()).update(`${header}.${body}`).digest()
  )
  return `${header}.${body}.${sig}`
}

function verify(token: string): ParticipantSession | null {
  const logger = createServiceLogger('ParticipantSession')
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      logger.warn({ parts: parts.length }, 'JWT has wrong number of parts')
      return null
    }
    const [header, body, sig] = parts
    const expected = base64url(
      crypto.createHmac('sha256', getSecret()).update(`${header}.${body}`).digest()
    )
    if (sig !== expected) {
      logger.warn({}, 'JWT signature mismatch')
      return null
    }
    const payload = JSON.parse(Buffer.from(body, 'base64').toString()) as ParticipantSession
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      logger.warn({ exp: payload.exp, now: Math.floor(Date.now() / 1000) }, 'JWT expired')
      return null
    }
    return payload
  } catch (err) {
    logger.error({ error: err instanceof Error ? err.message : String(err) }, 'JWT verify exception')
    return null
  }
}

export function createParticipantToken(data: Omit<ParticipantSession, 'iat' | 'exp'>): string {
  const now = Math.floor(Date.now() / 1000)
  return sign({ ...data, iat: now, exp: now + COOKIE_MAX_AGE })
}

/** Set participant session cookie (call from route handler) */
export async function setParticipantSession(data: Omit<ParticipantSession, 'iat' | 'exp'>): Promise<void> {
  const token = createParticipantToken(data)
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  })
}

/** Get participant session from cookie (call from server component or route handler) */
export async function getParticipantSession(): Promise<ParticipantSession | null> {
  const logger = createServiceLogger('ParticipantSession')
  try {
    const cookieStore = await cookies()
    const cookie = cookieStore.get(COOKIE_NAME)
    if (!cookie?.value) {
      logger.debug({ cookie_present: false }, 'participant_session cookie not found')
      return null
    }
    const session = verify(cookie.value)
    if (!session) {
      logger.warn({ cookie_length: cookie.value.length }, 'participant_session cookie found but verification failed')
      return null
    }
    logger.debug({ participant_id: session.participantId, org_id: session.orgId }, 'participant_session verified ok')
    return session
  } catch (err) {
    createServiceLogger('ParticipantSession').error({ error: err instanceof Error ? err.message : String(err) }, 'getParticipantSession error')
    return null
  }
}

/** Clear participant session cookie */
export async function clearParticipantSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}
