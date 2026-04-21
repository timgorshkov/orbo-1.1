'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Loader2, Bell, Settings } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import NotificationCard, { UnifiedNotification } from './notification-card';
import AssistBotBanner from './assist-bot-banner';
import { createClientLogger } from '@/lib/logger';

const logger = createClientLogger('NotificationsList');

interface NotificationsListProps {
  orgId: string;
}

interface NotificationsResponse {
  notifications: UnifiedNotification[];
  stats: {
    total: number;
    active: number;
    resolved: number;
    byType: Record<string, number>;
  };
}

const NOTIFICATION_TYPES: Array<{ value: string; label: string; icon: string; emptyHint: string }> = [
  { value: '', label: 'Все', icon: '📋', emptyHint: 'Нет уведомлений, требующих внимания' },
  { value: 'negative_discussion', label: 'Негатив', icon: '🔴', emptyHint: 'AI анализирует сообщения и уведомляет о конфликтах и токсичном поведении. Настройте чувствительность в Настройках.' },
  { value: 'unanswered_question', label: 'Вопросы', icon: '❓', emptyHint: 'AI находит вопросы участников, оставшиеся без ответа дольше заданного порога. Настройте время ожидания в Настройках.' },
  { value: 'group_inactive', label: 'Неактивность', icon: '💤', emptyHint: 'Уведомления появятся, если в группе нет сообщений дольше настроенного порога.' },
  { value: 'churning_participant', label: 'Отток', icon: '📉', emptyHint: 'Участники, которые были активны, но резко замолчали (>14 дней). Определяются автоматически.' },
  { value: 'inactive_newcomer', label: 'Новички', icon: '🆕', emptyHint: 'Участники, присоединившиеся менее 14 дней назад и ни разу не написавшие в группу.' },
  { value: 'critical_event', label: 'Регистрация', icon: '📅', emptyHint: 'Уведомления о событиях с низкой регистрацией (<30% от лимита).' },
];

// Авторезолв: уведомления старше 24ч считаем решёнными автоматически
const AUTO_RESOLVE_MS = 24 * 60 * 60 * 1000;

export default function NotificationsList({ orgId }: NotificationsListProps) {
  const [notifications, setNotifications] = useState<UnifiedNotification[]>([]);
  const [stats, setStats] = useState<NotificationsResponse['stats'] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [showResolved, setShowResolved] = useState(false);

  const fetchNotifications = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const params = new URLSearchParams({
        includeResolved: 'true',
        hoursBack: '168',
      });
      if (filterType) params.set('type', filterType);

      const response = await fetch(`/api/notifications/${orgId}?${params}`);
      if (!response.ok) throw new Error('Failed to fetch notifications');

      const data: NotificationsResponse = await response.json();

      // Авторезолв старых уведомлений (>24ч без решения).
      // Исключения: churning_participant и inactive_newcomer — не требуют оперативности,
      // комьюнити-менеджер может отработать их в течение нескольких дней.
      const AUTO_RESOLVE_EXCLUDED = new Set(['churning_participant', 'inactive_newcomer']);
      const now = Date.now();
      const processed = data.notifications.map(n => {
        if (!n.resolved_at
          && !AUTO_RESOLVE_EXCLUDED.has(n.notification_type)
          && (now - new Date(n.created_at).getTime()) > AUTO_RESOLVE_MS
        ) {
          return { ...n, resolved_at: new Date(now).toISOString(), resolved_by_name: 'авто (24ч)' };
        }
        return n;
      });

      setNotifications(processed);
      setStats(data.stats);
    } catch (error) {
      logger.error({ error }, 'Error fetching notifications');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [orgId, filterType]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleResolve = async (notificationId: string, sourceType: string) => {
    try {
      const response = await fetch(`/api/notifications/${orgId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId, sourceType }),
      });
      if (!response.ok) throw new Error('Failed to resolve notification');
      const result = await response.json();

      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId
            ? { ...n, resolved_at: result.resolvedAt, resolved_by_name: result.resolvedBy }
            : n
        )
      );
      if (stats) {
        setStats({ ...stats, active: stats.active - 1, resolved: stats.resolved + 1 });
      }
    } catch (error) {
      logger.error({ error }, 'Error resolving notification');
      throw error;
    }
  };

  const activeNotifications = notifications.filter(n => !n.resolved_at);
  const resolvedNotifications = notifications.filter(n => !!n.resolved_at);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AssistBotBanner orgId={orgId} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Уведомления
          </h2>
          {stats && (
            <span className="text-sm">
              <span className="font-medium text-amber-600">{activeNotifications.length}</span>
              <span className="text-gray-400 mx-1">·</span>
              <span className="text-green-600">{resolvedNotifications.length} решённых</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => fetchNotifications(true)} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Link href={`/p/${orgId}/settings?tab=notifications`}>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-1" /> Настройки
            </Button>
          </Link>
        </div>
      </div>

      {/* Фильтры-теги */}
      <div className="flex flex-wrap gap-1.5">
        {NOTIFICATION_TYPES.map(type => {
          const count = type.value
            ? notifications.filter(n => n.notification_type === type.value).length
            : notifications.length;
          const isActive = filterType === type.value;
          return (
            <button
              key={type.value}
              onClick={() => setFilterType(type.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {type.icon} {type.label}
              {count > 0 && <span className="ml-1 opacity-70">{count}</span>}
            </button>
          );
        })}
        <button
          onClick={() => setShowResolved(!showResolved)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ml-auto ${
            showResolved
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          ✓ Решённые {resolvedNotifications.length > 0 && `(${resolvedNotifications.length})`}
        </button>
      </div>

      {/* Layout: active (max-width) | resolved (справа на десктопе) */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,640px)_1fr] gap-6 items-start">
        {/* Active */}
        <div className="space-y-2">
          {activeNotifications.length > 0 ? (
            activeNotifications.map(n => (
              <NotificationCard key={n.id} notification={n} orgId={orgId} onResolve={handleResolve} />
            ))
          ) : (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">✨</div>
              <p className="text-gray-600 font-medium">Всё в порядке</p>
              <p className="text-sm text-gray-400 mt-1 max-w-sm mx-auto">
                {NOTIFICATION_TYPES.find(t => t.value === filterType)?.emptyHint || 'Нет уведомлений, требующих внимания'}
              </p>
            </div>
          )}
        </div>

        {/* Resolved — справа на десктопе, ниже на мобилке */}
        {showResolved && resolvedNotifications.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide">Решённые</h3>
            {resolvedNotifications.map(n => (
              <NotificationCard key={n.id} notification={n} orgId={orgId} onResolve={handleResolve} />
            ))}
          </div>
        ) : (
          <div className="hidden lg:block" /> /* Пустая колонка для сохранения layout */
        )}
      </div>
    </div>
  );
}
