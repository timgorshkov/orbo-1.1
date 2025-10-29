/**
 * Superadmin Guard
 * Проверяет права доступа к технической админке платформы
 */

import { redirect } from 'next/navigation'
import { createServerClient } from './supabaseServer'

/**
 * Проверяет является ли текущий пользователь активным суперадмином
 */
export async function isSuperadmin(): Promise<boolean> {
  const supabase = await createServerClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return false
  }
  
  // Проверяем наличие в таблице superadmins
  const { data: superadmin } = await supabase
    .from('superadmins')
    .select('is_active')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()
  
  return !!superadmin
}

/**
 * Требует права суперадмина, иначе редирект
 */
export async function requireSuperadmin() {
  const isAdmin = await isSuperadmin()
  
  if (!isAdmin) {
    redirect('/?error=superadmin_required')
  }
}

/**
 * Обновляет дату последнего входа суперадмина
 */
export async function updateSuperadminLastLogin() {
  const supabase = await createServerClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return
  }
  
  await supabase
    .from('superadmins')
    .update({ last_login_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('is_active', true)
}

