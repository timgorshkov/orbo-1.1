/**
 * Registrator Session — lightweight cookie-based auth for check-in staff.
 * Separate from NextAuth (admin) and participant_session (portal users).
 */

import { cookies } from 'next/headers'
import { createAdminServer } from '@/lib/server/supabaseServer'

const COOKIE_NAME = 'registrator_session'

export interface RegistratorSession {
  sessionId: string
  orgId: string
  name: string
}

/**
 * Read and validate the registrator session from cookie.
 * Returns null if no session or session revoked.
 */
export async function getRegistratorSession(): Promise<RegistratorSession | null> {
  const cookieStore = await cookies()
  const secret = cookieStore.get(COOKIE_NAME)?.value
  if (!secret) return null

  const db = createAdminServer()
  const { data } = await db
    .from('registrator_sessions')
    .select('id, org_id, name')
    .eq('session_secret', secret)
    .eq('is_active', true)
    .maybeSingle()

  if (!data) return null

  // Update last_used_at (fire-and-forget)
  db.from('registrator_sessions')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => {})
    .catch(() => {})

  return {
    sessionId: data.id,
    orgId: data.org_id,
    name: data.name,
  }
}

/**
 * Set the registrator session cookie.
 */
export async function setRegistratorCookie(secret: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  })
}

/**
 * Clear the registrator session cookie.
 */
export async function clearRegistratorCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}
