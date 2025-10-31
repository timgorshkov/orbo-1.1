/**
 * Superadmin Guard
 * Проверяет права доступа к технической админке платформы
 */

import { redirect } from 'next/navigation'
import { createClientServer, createAdminServer } from './supabaseServer'

/**
 * Проверяет является ли текущий пользователь активным суперадмином
 */
export async function isSuperadmin(): Promise<boolean> {
  const supabase = await createClientServer()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    console.log('[Superadmin Check] No user found')
    return false
  }
  
  console.log('[Superadmin Check] User ID:', user.id, 'Email:', user.email)
  
  // Используем admin клиент для обхода RLS
  const supabaseAdmin = createAdminServer()
  const { data: superadmin, error } = await supabaseAdmin
    .from('superadmins')
    .select('is_active')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()
  
  console.log('[Superadmin Check] Query result:', { superadmin, error })
  
  return !!superadmin
}

/**
 * Требует права суперадмина, иначе редирект
 */
export async function requireSuperadmin() {
  const supabase = await createClientServer()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/signin?error=auth_required&redirect=/superadmin')
  }
  
  const isAdmin = await isSuperadmin()
  
  if (!isAdmin) {
    redirect('/?error=access_denied')
  }
}

/**
 * Обновляет дату последнего входа суперадмина
 */
export async function updateSuperadminLastLogin() {
  const supabase = await createClientServer()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return
  }
  
  // Используем admin клиент для обхода RLS
  const supabaseAdmin = createAdminServer()
  await supabaseAdmin
    .from('superadmins')
    .update({ last_login_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('is_active', true)
}

