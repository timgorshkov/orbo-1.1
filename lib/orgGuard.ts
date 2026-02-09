import { createAdminServer } from './server/supabaseServer'
import { syncOrgAdmins } from './server/syncOrgAdmins'
import { createServiceLogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getEffectiveOrgRole } from './server/orgAccess'

type OrgRole = 'owner' | 'admin' | 'editor' | 'member' | 'viewer';

export async function requireOrgAccess(orgId: string, allowedRoles?: OrgRole[]) {
  const logger = createServiceLogger('requireOrgAccess');
  const startTime = Date.now();
  
  // Check auth via unified auth (supports both Supabase and NextAuth)
  const authStart = Date.now();
  const user = await getUnifiedUser()
  const authDuration = Date.now() - authStart;
  
  if (!user) {
    logger.warn({ org_id: orgId, auth_duration_ms: authDuration }, 'User not authenticated');
    throw new Error('Unauthorized')
  }

  const adminSupabase = createAdminServer()

  // Sync admin roles from Telegram groups
  // This runs in background and doesn't block access
  syncOrgAdmins(orgId).catch(err => {
    logger.error({ 
      error: err instanceof Error ? err.message : String(err),
      org_id: orgId
    }, 'Background admin sync failed');
  })

  // Check membership with superadmin fallback
  const membershipStart = Date.now();
  const access = await getEffectiveOrgRole(user.id, orgId);
  const membershipDuration = Date.now() - membershipStart;

  const totalDuration = Date.now() - startTime;
  
  if (!access) {
    logger.warn({
      org_id: orgId,
      user_id: user.id,
      user_email: user.email,
      user_provider: user.provider,
      auth_duration_ms: authDuration,
      membership_query_duration_ms: membershipDuration,
      total_duration_ms: totalDuration
    }, 'Access denied - no membership or superadmin status');
    throw new Error('Forbidden')
  }

  const role = access.role as OrgRole

  if (allowedRoles && !allowedRoles.includes(role)) {
    logger.warn({
      org_id: orgId,
      user_id: user.id,
      user_role: role,
      allowed_roles: allowedRoles,
      is_superadmin: access.isSuperadmin,
      total_duration_ms: totalDuration
    }, 'Access denied - insufficient role');
    throw new Error('Forbidden')
  }

  // Логируем только медленные запросы (raised to 2s to reduce noise from remote Supabase)
  if (totalDuration > 2000) {
    logger.warn({
      org_id: orgId,
      user_id: user.id,
      role,
      is_superadmin: access.isSuperadmin,
      auth_duration_ms: authDuration,
      membership_query_duration_ms: membershipDuration,
      total_duration_ms: totalDuration
    }, 'Slow org access check');
  }

  return { supabase: adminSupabase, user, role }
}
