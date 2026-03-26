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
 * - NextAuth users: role from memberships table (via getEffectiveOrgRole)
 * - participant_session users: always role='member' for their org
 */
export async function getPublicPortalAccess(orgId: string): Promise<PortalAccess | null> {
  const user = await getUnifiedUser()

  if (user) {
    const { getEffectiveOrgRole } = await import('@/lib/server/orgAccess')
    const access = await getEffectiveOrgRole(user.id, orgId)
    if (!access) return null
    return {
      role: access.role as PortalAccess['role'],
      userId: user.id,
      participantId: null,
      isParticipantSession: false,
    }
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
