/**
 * Утилиты для определения роли пользователя в организации
 */

import { createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'

export type UserRole = 'owner' | 'admin' | 'member' | 'guest'

export interface UserOrgRole {
  orgId: string
  role: UserRole
  hasAccess: boolean
}

/**
 * Получить роль пользователя в организации (server-side)
 * Использует admin client для работы с NextAuth пользователями (нет Supabase session)
 */
export async function getUserRoleInOrg(
  userId: string,
  orgId: string
): Promise<UserRole> {
  const supabase = createAdminServer()

  // Вызываем SQL функцию get_user_role_in_org
  const { data, error } = await supabase.rpc('get_user_role_in_org', {
    p_user_id: userId,
    p_org_id: orgId,
  })

  if (error) {
    const logger = createServiceLogger('getUserRoleInOrg');
    logger.error({ 
      error: error.message,
      user_id: userId,
      org_id: orgId
    }, 'Error getting user role');
    return 'guest'
  }

  // PostgreSQL RPC может вернуть:
  // - Supabase: 'owner' (строка напрямую)
  // - PostgresClient: { get_user_role_in_org: 'owner' } или [{ get_user_role_in_org: 'owner' }]
  let role: UserRole = 'guest';
  if (typeof data === 'string') {
    role = data as UserRole;
  } else if (Array.isArray(data) && data.length > 0) {
    const firstRow = data[0];
    role = (firstRow?.get_user_role_in_org || firstRow) as UserRole;
  } else if (data && typeof data === 'object') {
    role = ((data as any).get_user_role_in_org || data) as UserRole;
  }
  
  return role || 'guest'
}

/**
 * Проверить, имеет ли пользователь доступ к организации
 */
export async function checkOrgAccess(
  userId: string,
  orgId: string
): Promise<UserOrgRole> {
  const role = await getUserRoleInOrg(userId, orgId)
  return {
    orgId,
    role,
    hasAccess: role !== 'guest',
  }
}

/**
 * Проверить, является ли пользователь админом или владельцем
 */
export function isAdminOrOwner(role: UserRole): boolean {
  return role === 'owner' || role === 'admin'
}

/**
 * Проверить, является ли пользователь участником (любая роль кроме guest)
 */
export function isMember(role: UserRole): boolean {
  return role !== 'guest'
}

/**
 * Получить все организации пользователя с ролями
 * Использует admin client для работы с NextAuth пользователями
 */
export async function getUserOrganizations(userId: string) {
  const supabase = createAdminServer()

  const { data, error } = await supabase
    .from('user_organizations')
    .select('*')
    .eq('user_id', userId)
    .order('role_priority', { ascending: true })
    .order('org_name', { ascending: true })

  if (error) {
    const logger = createServiceLogger('getUserOrganizations');
    logger.error({ 
      error: error.message,
      user_id: userId
    }, 'Error getting user organizations');
    return []
  }

  return data || []
}

/**
 * Получить права доступа для роли (helper для UI)
 */
export function getRolePermissions(role: UserRole) {
  return {
    canViewDashboard: role === 'owner' || role === 'admin',
    canManageTelegram: role === 'owner' || role === 'admin',
    canManageSettings: role === 'owner' || role === 'admin',
    canEditMaterials: role === 'owner' || role === 'admin',
    canViewMaterials: role !== 'guest',
    canCreateEvents: role === 'owner' || role === 'admin',
    canViewEvents: role !== 'guest',
    canRegisterForEvents: role !== 'guest',
    canViewMembers: role !== 'guest',
    canEditMembers: role === 'owner' || role === 'admin',
  }
}

