import { createAdminServer } from './server/supabaseServer'
import { syncOrgAdmins } from './server/syncOrgAdmins'
import { createServiceLogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

type OrgRole = 'owner' | 'admin' | 'editor' | 'member' | 'viewer';

export async function requireOrgAccess(orgId: string, allowedRoles?: OrgRole[]) {
  const logger = createServiceLogger('requireOrgAccess');
  
  // Check auth via unified auth (supports both Supabase and NextAuth)
  const user = await getUnifiedUser()
  if (!user) throw new Error('Unauthorized')

  const adminSupabase = createAdminServer()

  // Sync admin roles from Telegram groups
  // This runs in background and doesn't block access
  syncOrgAdmins(orgId).catch(err => {
    logger.error({ 
      error: err instanceof Error ? err.message : String(err),
      org_id: orgId
    }, 'Background admin sync failed');
  })

  // Проверяем членство в org напрямую
  let role: OrgRole | null = null

  const { data: membership, error: membershipError } = await adminSupabase
    .from('memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (membershipError || !membership) {
    throw new Error('Forbidden')
  }

  role = membership.role as OrgRole

  if (allowedRoles && !allowedRoles.includes(role)) {
    throw new Error('Forbidden')
  }

  return { supabase: adminSupabase, user, role }
}
