/**
 * Определение стартовой страницы для пользователя в зависимости от роли и контента
 */

import { createClientServer } from '@/lib/server/supabaseServer'
import { type UserRole } from './getUserRole'

/**
 * Получить стартовую страницу для пользователя
 * 
 * Логика:
 * - Admin/Owner → /app/[org]/dashboard
 * - Member → /app/[org]/materials (первая корневая страница)
 *   - Если материалов нет → /app/[org]/events
 *   - Если событий нет → /app/[org]/members
 */
export async function getDefaultRoute(orgId: string, role: UserRole): Promise<string> {
  // Для админов и владельцев всегда дашборд
  if (role === 'owner' || role === 'admin') {
    return `/app/${orgId}/dashboard`
  }

  // Для участников определяем на основе наличия контента
  if (role === 'member') {
    const supabase = await createClientServer()

    // 1. Проверяем наличие материалов
    const { data: materials, error: materialsError } = await supabase
      .from('materials')
      .select('id')
      .eq('org_id', orgId)
      .is('parent_id', null) // Только корневые элементы
      .order('position', { ascending: true })
      .limit(1)

    if (!materialsError && materials && materials.length > 0) {
      // Открываем первый корневой материал
      return `/app/${orgId}/materials/${materials[0].id}`
    }

    // 2. Если материалов нет, проверяем события
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('id')
      .eq('org_id', orgId)
      .eq('status', 'published')
      .gte('event_date', new Date().toISOString())
      .limit(1)

    if (!eventsError && events && events.length > 0) {
      // Есть предстоящие события
      return `/app/${orgId}/events`
    }

    // 3. Если нет ни материалов, ни событий → участники
    return `/app/${orgId}/members`
  }

  // Для guest (не должно быть, но на всякий случай)
  return `/app/${orgId}/events`
}

/**
 * Получить список доступных разделов для роли
 */
export function getAvailableSections(role: UserRole) {
  if (role === 'owner' || role === 'admin') {
    return [
      { key: 'dashboard', label: 'Дашборд', icon: '📊', href: 'dashboard' },
      { key: 'materials', label: 'Материалы', icon: '📄', href: 'materials' },
      { key: 'events', label: 'События', icon: '📅', href: 'events' },
      { key: 'members', label: 'Участники', icon: '👥', href: 'members' },
      { key: 'telegram', label: 'Telegram', icon: '💬', href: 'telegram' },
    ]
  }

  if (role === 'member') {
    return [
      { key: 'materials', label: 'Материалы', icon: '📄', href: 'materials' },
      { key: 'events', label: 'События', icon: '📅', href: 'events' },
      { key: 'members', label: 'Участники', icon: '👥', href: 'members' },
    ]
  }

  return []
}

