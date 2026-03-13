import { createAdminServer } from '@/lib/server/supabaseServer'
import { orgHasMembershipPlans, isResourceGated, hasActiveAccess } from '@/lib/services/membershipService'

/**
 * Server-side check: does this user need an active membership to access a resource?
 * Returns { allowed: true } if:
 *   - The org has no active membership plans (no gating)
 *   - The resource is not listed in any plan's access rules
 *   - The user is an admin/owner (always allowed)
 *   - The user has an active/trial membership
 * Returns { allowed: false, reason } otherwise.
 */
export async function checkMembershipGate(params: {
  orgId: string
  userId: string
  resourceType: 'events' | 'materials' | 'member_directory' | 'telegram_group' | 'telegram_channel' | 'max_group'
  resourceId?: string
  role?: string
}): Promise<{ allowed: boolean; reason?: string }> {
  if (params.role === 'owner' || params.role === 'admin') {
    return { allowed: true }
  }

  const hasPlans = await orgHasMembershipPlans(params.orgId)
  if (!hasPlans) return { allowed: true }

  const gated = await isResourceGated(params.orgId, params.resourceType, params.resourceId)
  if (!gated) return { allowed: true }

  const supabase = createAdminServer()
  const { data: participant } = await supabase
    .from('participants')
    .select('id')
    .eq('user_id', params.userId)
    .eq('org_id', params.orgId)
    .limit(1)
    .maybeSingle()

  if (!participant) {
    return { allowed: false, reason: 'Требуется членство в клубе для доступа к этому ресурсу' }
  }

  const hasAccess = await hasActiveAccess(params.orgId, participant.id, params.resourceType, params.resourceId)
  if (hasAccess) return { allowed: true }

  return { allowed: false, reason: 'Требуется членство в клубе для доступа к этому ресурсу' }
}
