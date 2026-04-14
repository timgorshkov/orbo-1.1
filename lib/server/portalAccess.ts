/**
 * Public portal access helper.
 * Checks both NextAuth (unified auth) and participant_session cookie.
 * Use in /p/[org]/ pages that participants should be able to view.
 */

import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getParticipantSession } from '@/lib/participant-auth/session'

export type PortalAccess = {
  role: 'owner' | 'admin' | 'member' | 'guest'
  userId: string | null          // NextAuth user id, null for participant-session users
  participantId: string | null   // participant id, null for NextAuth-only users
  isParticipantSession: boolean
}

/**
 * Returns access info for the current request, or null if not authenticated at all.
 * - NextAuth users with membership: role from memberships table
 * - NextAuth users without membership but linked to a participant: treated as 'member'
 *   (e.g. signed in via Telegram 6-digit code — they're community participants, not org admins)
 * - participant_session users: always role='member' for their org
 */
export async function getPublicPortalAccess(orgId: string): Promise<PortalAccess | null> {
  const user = await getUnifiedUser()

  if (user) {
    const { getEffectiveOrgRole } = await import('@/lib/server/orgAccess')
    const access = await getEffectiveOrgRole(user.id, orgId)
    if (access) {
      return {
        role: access.role as PortalAccess['role'],
        userId: user.id,
        participantId: null,
        isParticipantSession: false,
      }
    }

    // No membership — check if this user is a community participant in the org.
    // Happens when a participant signs in via Telegram 6-digit code: they get a NextAuth
    // session, but aren't in `memberships` (that's only for org admins/owners).
    const { createAdminServer } = await import('@/lib/server/supabaseServer')
    const db = createAdminServer()

    const { data: directParticipant } = await db
      .from('participants')
      .select('id')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .is('merged_into', null)
      .maybeSingle()

    let participantId = directParticipant?.id || null

    if (!participantId) {
      const { data: tgAccount } = await db
        .from('user_telegram_accounts')
        .select('telegram_user_id')
        .eq('user_id', user.id)
        .eq('org_id', orgId)
        .maybeSingle()

      if (tgAccount?.telegram_user_id) {
        const { data: participantByTg } = await db
          .from('participants')
          .select('id')
          .eq('org_id', orgId)
          .eq('tg_user_id', tgAccount.telegram_user_id)
          .is('merged_into', null)
          .maybeSingle()
        participantId = participantByTg?.id || null
      }
    }

    if (participantId) {
      return {
        role: 'member',
        userId: user.id,
        participantId,
        isParticipantSession: false,
      }
    }

    return null
  }

  // Fallback: participant_session cookie
  const participantSession = await getParticipantSession()
  if (participantSession?.orgId === orgId) {
    return {
      role: 'member',
      userId: null,
      participantId: participantSession.participantId,
      isParticipantSession: true,
    }
  }

  return null
}
