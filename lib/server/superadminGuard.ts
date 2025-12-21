/**
 * Superadmin Guard
 * Проверяет права доступа к технической админке платформы
 * 
 * ⚡ ОБНОВЛЕНО: Теперь использует unified auth (Supabase + NextAuth OAuth)
 */

import { redirect } from 'next/navigation'
import { createAdminServer } from './supabaseServer'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('SuperadminGuard');

/**
 * Проверяет является ли текущий пользователь активным суперадмином
 * Поддерживает как Supabase auth, так и NextAuth (OAuth)
 */
export async function isSuperadmin(): Promise<boolean> {
  // Используем unified auth для поддержки OAuth
  const user = await getUnifiedUser()
  
  if (!user) {
    logger.debug({}, 'No user found');
    return false
  }
  
  logger.debug({ user_id: user.id, email: user.email, provider: user.provider }, 'Checking superadmin status');
  
  // Используем admin клиент для обхода RLS
  const supabaseAdmin = createAdminServer()
  const { data: superadmin, error } = await supabaseAdmin
    .from('superadmins')
    .select('is_active')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()
  
  logger.debug({ 
    user_id: user.id,
    is_superadmin: !!superadmin,
    error: error?.message
  }, 'Query result');
  
  return !!superadmin
}

/**
 * Требует права суперадмина, иначе редирект
 */
export async function requireSuperadmin() {
  // Используем unified auth для поддержки OAuth
  const user = await getUnifiedUser()
  
  if (!user) {
    logger.debug({}, 'No user, redirecting to signin');
    redirect('/signin?error=auth_required&redirect=/superadmin')
  }
  
  logger.debug({ user_id: user.id, email: user.email, provider: user.provider }, 'User authenticated, checking superadmin');
  
  // Используем admin клиент для обхода RLS
  const supabaseAdmin = createAdminServer()
  const { data: superadmin, error } = await supabaseAdmin
    .from('superadmins')
    .select('is_active')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()
  
  if (error) {
    logger.error({ user_id: user.id, error: error.message }, 'Error checking superadmin status');
  }
  
  if (!superadmin) {
    logger.warn({ user_id: user.id, email: user.email }, 'User is not a superadmin');
    redirect('/?error=access_denied')
  }
  
  logger.debug({ user_id: user.id }, 'Superadmin access granted');
}

/**
 * Обновляет дату последнего входа суперадмина
 */
export async function updateSuperadminLastLogin() {
  // Используем unified auth для поддержки OAuth
  const user = await getUnifiedUser()
  
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

