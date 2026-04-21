'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Bell, ChevronRight, AlertTriangle, MessageCircle, Clock, Calendar, UserMinus, UserX, ExternalLink } from 'lucide-react'

interface CriticalEvent {
  id: string
  title: string
  event_date: string
  start_time: string
  registeredCount: number
  capacity: number
  registrationRate: number
}

interface AIAlert {
  id: string
  type: string
  message: string
  severity: string
  created_at: string
  group_name?: string
  link_url?: string
}

interface ChurningParticipant {
  participant_id: string
  full_name: string
  username: string
  days_since_activity: number
  previous_activity_score: number
}

interface InactiveNewcomer {
  participant_id: string
  full_name: string
  username: string
  days_since_join: number
  activity_count: number
}

interface HasMore {
  churning?: number
  newcomers?: number
  events?: number
}

interface AttentionZonesProps {
  orgId: string
  criticalEvents: CriticalEvent[]
  churningParticipants: ChurningParticipant[]
  inactiveNewcomers: InactiveNewcomer[]
  hasMore?: HasMore
  aiAlerts?: AIAlert[]
}

const MAX_DASHBOARD_ITEMS = 4

export default function AttentionZones({
  orgId,
  criticalEvents,
  churningParticipants,
  inactiveNewcomers,
  hasMore = {},
  aiAlerts = []
}: AttentionZonesProps) {
  // Собираем единый список items с приоритетами (стиль notification-card)
  type DashboardItem = {
    key: string
    icon: React.ReactNode
    label: string
    text: string
    subtext?: string
    href: string
    externalHref?: string
    accentColor: string
    bgColor: string
    iconColor: string
    priority: number
  }

  const items: DashboardItem[] = []

  // 1. Негатив (highest priority)
  aiAlerts
    .filter(a => a.type === 'negative_discussion')
    .forEach(a => items.push({
      key: `neg-${a.id}`,
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      label: 'Негатив',
      text: a.message?.substring(0, 100) || 'Обнаружена негативная дискуссия',
      subtext: a.group_name || undefined,
      href: `/p/${orgId}/notifications`,
      externalHref: (a as any).link_url || undefined,
      accentColor: 'border-l-red-500',
      bgColor: 'bg-red-50/60',
      iconColor: 'text-red-600',
      priority: 1,
    }))

  // 2. Неотвеченные вопросы
  aiAlerts
    .filter(a => a.type === 'unanswered_question')
    .forEach(a => items.push({
      key: `q-${a.id}`,
      icon: <MessageCircle className="h-3.5 w-3.5" />,
      label: 'Вопрос',
      text: a.message?.substring(0, 100) || 'Вопрос без ответа',
      subtext: a.group_name || undefined,
      href: `/p/${orgId}/notifications`,
      externalHref: (a as any).link_url || undefined,
      accentColor: 'border-l-amber-400',
      bgColor: 'bg-amber-50/60',
      iconColor: 'text-amber-600',
      priority: 2,
    }))

  // 3. Низкая регистрация
  criticalEvents.forEach(e => items.push({
    key: `evt-${e.id}`,
    icon: <Calendar className="h-3.5 w-3.5" />,
    label: 'Регистрация',
    text: e.title,
    subtext: `${e.registeredCount}/${e.capacity} (${e.registrationRate}%)`,
    href: `/p/${orgId}/events/${e.id}`,
    accentColor: 'border-l-red-500',
    bgColor: 'bg-red-50/60',
    iconColor: 'text-red-600',
    priority: 3,
  }))

  // 4. Неактивность группы
  aiAlerts
    .filter(a => a.type === 'group_inactive')
    .forEach(a => items.push({
      key: `inact-${a.id}`,
      icon: <Clock className="h-3.5 w-3.5" />,
      label: 'Неактивность',
      text: a.group_name || 'Группа без сообщений',
      href: `/p/${orgId}/notifications`,
      accentColor: 'border-l-gray-300',
      bgColor: 'bg-gray-50',
      iconColor: 'text-gray-400',
      priority: 4,
    }))

  // 5. Отток (low priority on dashboard)
  churningParticipants.slice(0, 2).forEach(p => items.push({
    key: `churn-${p.participant_id}`,
    icon: <UserMinus className="h-3.5 w-3.5" />,
    label: 'Отток',
    text: p.full_name || p.username || 'Участник',
    subtext: `молчит ${p.days_since_activity} дн.`,
    href: `/p/${orgId}/members/${p.participant_id}`,
    accentColor: 'border-l-gray-300',
    bgColor: 'bg-gray-50',
    iconColor: 'text-gray-400',
    priority: 5,
  }))

  // 6. Новички (lowest priority on dashboard)
  inactiveNewcomers.slice(0, 2).forEach(n => items.push({
    key: `new-${n.participant_id}`,
    icon: <UserX className="h-3.5 w-3.5" />,
    label: 'Новичок',
    text: n.full_name || n.username || 'Участник',
    subtext: `${n.days_since_join} дн. назад`,
    href: `/p/${orgId}/members/${n.participant_id}`,
    accentColor: 'border-l-gray-300',
    bgColor: 'bg-gray-50',
    iconColor: 'text-gray-400',
    priority: 6,
  }))

  // Сортируем по приоритету и берём MAX_DASHBOARD_ITEMS
  items.sort((a, b) => a.priority - b.priority)
  const visibleItems = items.slice(0, MAX_DASHBOARD_ITEMS)
  const remainingCount = items.length - visibleItems.length

  if (items.length === 0) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="pt-6">
          <div className="text-center">
            <div className="text-4xl mb-2">✨</div>
            <p className="text-green-800 font-medium">Всё в порядке!</p>
            <p className="text-sm text-green-600 mt-1">Нет зон, требующих внимания</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-gray-200">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-base">
            <span className="text-xl">🔥</span>
            Зоны внимания
          </div>
          <Link
            href={`/p/${orgId}/notifications`}
            className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-normal"
          >
            <Bell className="h-3.5 w-3.5" />
            Все уведомления
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 pt-0">
        {visibleItems.map(item => (
          <div
            key={item.key}
            className={`border-l-4 rounded-md ${item.accentColor} ${item.bgColor} px-3 py-2`}
          >
            <div className="flex items-center gap-2">
              <div className={`flex-shrink-0 ${item.iconColor}`}>
                {item.icon}
              </div>
              <span className={`text-[11px] font-semibold ${item.iconColor} flex-shrink-0`}>
                {item.label}
              </span>
              <Link href={item.href} className="text-sm text-gray-800 hover:text-blue-700 hover:underline truncate flex-1">
                {item.text}
              </Link>
              {item.subtext && (
                <span className="text-xs text-gray-400 flex-shrink-0 hidden sm:block">
                  {item.subtext}
                </span>
              )}
              {item.externalHref && (
                <a href={item.externalHref} target="_blank" rel="noopener noreferrer"
                  className="text-gray-400 hover:text-blue-600 flex-shrink-0">
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        ))}
        {remainingCount > 0 && (
          <Link
            href={`/p/${orgId}/notifications`}
            className="block text-xs text-gray-500 hover:text-blue-600 text-center pt-1"
          >
            Ещё {remainingCount} →
          </Link>
        )}
      </CardContent>
    </Card>
  )
}
