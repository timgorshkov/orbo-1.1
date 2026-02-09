/**
 * Organization Access Helper
 * 
 * Centralized function to determine a user's effective role in an organization.
 * Checks real membership first, then falls back to superadmin status.
 * 
 * This allows superadmins to access any organization as 'owner' for support purposes,
 * without needing an actual membership row.
 */

import { createAdminServer } from './supabaseServer';
import { createServiceLogger } from '@/lib/logger';

const logger = createServiceLogger('OrgAccess');

export interface EffectiveOrgRole {
  role: string;
  isSuperadmin: boolean;
}

/**
 * Returns the effective role of a user in an organization.
 * 
 * 1. Checks memberships table for a real membership
 * 2. If not found, checks superadmins table
 * 3. If active superadmin, returns virtual 'owner' role
 * 4. If neither, returns null (no access)
 */
export async function getEffectiveOrgRole(
  userId: string,
  orgId: string
): Promise<EffectiveOrgRole | null> {
  const adminSupabase = createAdminServer();

  // 1. Check real membership
  const { data: membership, error: membershipError } = await adminSupabase
    .from('memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();

  if (membershipError) {
    logger.error({ user_id: userId, org_id: orgId, error: membershipError.message }, 'Error checking membership');
  }

  if (membership) {
    return { role: membership.role, isSuperadmin: false };
  }

  // 2. Check superadmin status (fallback)
  const { data: superadmin, error: saError } = await adminSupabase
    .from('superadmins')
    .select('is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (saError) {
    logger.error({ user_id: userId, error: saError.message }, 'Error checking superadmin status');
  }

  if (superadmin) {
    logger.info({ user_id: userId, org_id: orgId }, 'Superadmin accessing org as virtual owner');
    return { role: 'owner', isSuperadmin: true };
  }

  // 3. No access
  return null;
}
