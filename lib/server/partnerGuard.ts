/**
 * Partner Guard
 * Проверяет права доступа к партнёрскому кабинету
 */

import { redirect } from 'next/navigation'
import { createAdminServer } from './supabaseServer'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('PartnerGuard');

export interface PartnerInfo {
  id: string
  name: string
  code: string
  email: string
  contact: string | null
  is_active: boolean
}

/**
 * Проверяет является ли текущий пользователь активным партнёром
 * Ищет по email пользователя в таблице partners
 */
export async function isPartner(): Promise<boolean> {
  const user = await getUnifiedUser()

  if (!user?.email) {
    return false
  }

  const db = createAdminServer()
  const { data: partner } = await db
    .from('partners')
    .select('id')
    .eq('email', user.email)
    .eq('is_active', true)
    .maybeSingle()

  return !!partner
}

/**
 * Возвращает информацию о партнёре или null
 */
export async function getPartnerInfo(): Promise<PartnerInfo | null> {
  const user = await getUnifiedUser()

  if (!user?.email) {
    return null
  }

  const db = createAdminServer()
  const { data: partner, error } = await db
    .from('partners')
    .select('id, name, code, email, contact, is_active')
    .eq('email', user.email)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    logger.error({ error: error.message, email: user.email }, 'Error fetching partner info')
    return null
  }

  // Привязываем user_id если ещё не привязан
  if (partner && !partner.user_id) {
    await db
      .from('partners')
      .update({ user_id: user.id, updated_at: new Date().toISOString() })
      .eq('id', partner.id)
  }

  return partner
}

/**
 * Требует права партнёра, иначе редирект
 */
export async function requirePartner(): Promise<PartnerInfo> {
  const user = await getUnifiedUser()

  if (!user) {
    redirect('/signin?error=auth_required&redirect=/partner')
  }

  const partner = await getPartnerInfo()

  if (!partner) {
    logger.warn({ email: user.email }, 'User is not a partner')
    redirect('/?error=access_denied')
  }

  logger.debug({ partner_id: partner.id, email: partner.email }, 'Partner access granted')
  return partner
}
