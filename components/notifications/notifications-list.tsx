'use client';

import { useState, useEffect, useCallback } from 'react';
import { Filter, RefreshCw, Loader2, Bell, CheckCircle2, Settings } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import NotificationCard, { UnifiedNotification } from './notification-card';
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

const NOTIFICATION_TYPES = [
  { value: '', label: 'Все типы' },
  { value: 'negative_discussion', label: 'Негатив в группе' },
  { value: 'unanswered_question', label: 'Неотвеченные вопросы' },
  { value: 'group_inactive', label: 'Неактивные группы' },
  { value: 'churning_participant', label: 'Участники на грани оттока' },
  { value: 'inactive_newcomer', label: 'Новички без активности' },
  { value: 'critical_event', label: 'Критичные события' },
];

export default function NotificationsList({ orgId }: NotificationsListProps) {
  const [notifications, setNotifications] = useState<UnifiedNotification[]>([]);
  const [stats, setStats] = useState<NotificationsResponse['stats'] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [showResolved, setShowResolved] = useState(true);
  
  const fetchNotifications = useCallback(async (refresh = false) => {
    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    
    try {
      const params = new URLSearchParams({
        includeResolved: showResolved.toString(),
        hoursBack: '168', // 7 days
      });
      
      if (filterType) {
        params.set('type', filterType);
      }
      
      const response = await fetch(`/api/notifications/${orgId}?${params}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch notifications');
      }
      
      const data: NotificationsResponse = await response.json();
      setNotifications(data.notifications);
      setStats(data.stats);
    } catch (error) {
      logger.error({ error }, 'Error fetching notifications');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [orgId, filterType, showResolved]);
  
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
      
      if (!response.ok) {
        throw new Error('Failed to resolve notification');
      }
      
      const result = await response.json();
      
      // Update local state
      setNotifications(prev => 
        prev.map(n => 
          n.id === notificationId 
            ? { 
                ...n, 
                resolved_at: result.resolvedAt, 
                resolved_by_name: result.resolvedBy 
              }
            : n
        )
      );
      
      // Update stats
      if (stats) {
        setStats({
          ...stats,
          active: stats.active - 1,
          resolved: stats.resolved + 1,
        });
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
    <div className="space-y-6">
      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Уведомления
          </h2>
          {stats && (
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span className="font-medium text-amber-600">
                {stats.active} активных
              </span>
              <span>•</span>
              <span className="text-green-600">
                {stats.resolved} решённых
              </span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Filter by type */}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3">
                <Filter className="h-4 w-4 mr-2" />
                {filterType 
                  ? NOTIFICATION_TYPES.find(t => t.value === filterType)?.label 
                  : 'Фильтр'}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-white border shadow-md z-50">
              {NOTIFICATION_TYPES.map(type => (
                <DropdownMenuItem
                  key={type.value}
                  onSelect={() => setFilterType(type.value)}
                  className={filterType === type.value ? 'bg-gray-100' : ''}
                >
                  {type.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          
          {/* Toggle resolved */}
          <Button
            variant={showResolved ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowResolved(!showResolved)}
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            {showResolved ? 'Скрыть решённые' : 'Показать решённые'}
          </Button>
          
          {/* Refresh */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchNotifications(true)}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          
          {/* Settings link */}
          <Link href={`/p/${orgId}/settings?tab=notifications`}>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Настройки
            </Button>
          </Link>
        </div>
      </div>
      
      {/* Active notifications */}
      {activeNotifications.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-700">
            Требуют внимания ({activeNotifications.length})
          </h3>
          {activeNotifications.map(notification => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              orgId={orgId}
              onResolve={handleResolve}
            />
          ))}
        </div>
      )}
      
      {/* Resolved notifications */}
      {showResolved && resolvedNotifications.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-500">
            Решённые ({resolvedNotifications.length})
          </h3>
          {resolvedNotifications.map(notification => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              orgId={orgId}
              onResolve={handleResolve}
            />
          ))}
        </div>
      )}
      
      {/* Empty state */}
      {notifications.length === 0 && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-4xl mb-2">✨</div>
              <p className="text-green-800 font-medium">Все отлично!</p>
              <p className="text-sm text-green-600 mt-1">
                Нет уведомлений, требующих внимания
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Stats by type */}
      {stats && Object.keys(stats.byType).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">По типам</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.byType).map(([type, count]) => (
                <div
                  key={type}
                  className="px-3 py-1 bg-gray-100 rounded-full text-sm"
                >
                  {NOTIFICATION_TYPES.find(t => t.value === type)?.label || type}: {count}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

