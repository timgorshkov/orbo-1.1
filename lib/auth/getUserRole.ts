/**
 * Утилиты для определения роли пользователя в организации
 */

import { createClientServer } from '@/lib/server/supabaseServer'

export type UserRole = 'owner' | 'admin' | 'member' | 'guest'

export interface UserOrgRole {
  orgId: string
  role: UserRole
  hasAccess: boolean
}

/**
 * Получить роль пользователя в организации (server-side)
 */
export async function getUserRoleInOrg(
  userId: string,
  orgId: string
): Promise<UserRole> {
  const supabase = await createClientServer()

  // Вызываем SQL функцию get_user_role_in_org
  const { data, error } = await supabase.rpc('get_user_role_in_org', {
    p_user_id: userId,
    p_org_id: orgId,
  })

  if (error) {
    console.error('Error getting user role:', error)
    return 'guest'
  }

  return (data as UserRole) || 'guest'
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
 */
export async function getUserOrganizations(userId: string) {
  const supabase = await createClientServer()

  const { data, error } = await supabase
    .from('user_organizations')
    .select('*')
    .eq('user_id', userId)
    .order('role_priority', { ascending: true })
    .order('org_name', { ascending: true })

  if (error) {
    console.error('Error getting user organizations:', error)
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

