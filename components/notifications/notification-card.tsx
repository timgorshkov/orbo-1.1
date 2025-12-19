'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Check, AlertTriangle, MessageCircle, Clock, Users, Calendar, Loader2, UserMinus, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { createClientLogger } from '@/lib/logger';

const logger = createClientLogger('NotificationCard');

export interface UnifiedNotification {
  id: string;
  created_at: string;
  notification_type: string;
  source_type: 'notification_rule' | 'attention_zone';
  title: string;
  description: string;
  severity: 'error' | 'warning' | 'info' | 'high' | 'medium' | 'low';
  link_url: string;
  link_text: string;
  metadata: Record<string, unknown>;
  resolved_at: string | null;
  resolved_by: string | null;
  resolved_by_name: string | null;
}

interface NotificationCardProps {
  notification: UnifiedNotification;
  orgId: string;
  onResolve: (id: string, sourceType: string) => Promise<void>;
}

// Конфигурация типов уведомлений с цветами и иконками
const NOTIFICATION_CONFIG: Record<string, {
  icon: React.ReactNode;
  label: string;
  borderColor: string;
  bgColor: string;
  iconColor: string;
  hint?: string;
}> = {
  negative_discussion: {
    icon: <AlertTriangle className="h-5 w-5" />,
    label: 'Негатив в группе',
    borderColor: 'border-l-red-500',
    bgColor: 'bg-red-50',
    iconColor: 'text-red-500',
    hint: 'Обнаружена негативная дискуссия',
  },
  unanswered_question: {
    icon: <MessageCircle className="h-5 w-5" />,
    label: 'Неотвеченный вопрос',
    borderColor: 'border-l-orange-500',
    bgColor: 'bg-orange-50',
    iconColor: 'text-orange-500',
    hint: 'Вопрос ожидает ответа',
  },
  group_inactive: {
    icon: <Clock className="h-5 w-5" />,
    label: 'Неактивность группы',
    borderColor: 'border-l-gray-500',
    bgColor: 'bg-gray-50',
    iconColor: 'text-gray-500',
    hint: 'Группа неактивна',
  },
  churning_participant: {
    icon: <UserMinus className="h-5 w-5" />,
    label: 'На грани оттока',
    borderColor: 'border-l-amber-500',
    bgColor: 'bg-amber-50',
    iconColor: 'text-amber-600',
    hint: 'Молчит более 14 дней',
  },
  inactive_newcomer: {
    icon: <UserX className="h-5 w-5" />,
    label: 'Неактивный новичок',
    borderColor: 'border-l-blue-500',
    bgColor: 'bg-blue-50',
    iconColor: 'text-blue-500',
    hint: 'Нет активности после вступления',
  },
  critical_event: {
    icon: <Calendar className="h-5 w-5" />,
    label: 'Критичное событие',
    borderColor: 'border-l-red-500',
    bgColor: 'bg-red-50',
    iconColor: 'text-red-500',
    hint: 'Низкая регистрация',
  },
};

const DEFAULT_CONFIG = {
  icon: <AlertTriangle className="h-5 w-5" />,
  label: 'Уведомление',
  borderColor: 'border-l-gray-300',
  bgColor: 'bg-gray-50',
  iconColor: 'text-gray-500',
};

export default function NotificationCard({ notification, orgId, onResolve }: NotificationCardProps) {
  const [isResolving, setIsResolving] = useState(false);
  const isResolved = !!notification.resolved_at;
  
  const config = NOTIFICATION_CONFIG[notification.notification_type] || DEFAULT_CONFIG;
  
  const handleResolve = async () => {
    if (isResolved || isResolving) return;
    
    setIsResolving(true);
    try {
      await onResolve(notification.id, notification.source_type);
    } catch (error) {
      logger.error({ error }, 'Error resolving notification');
    } finally {
      setIsResolving(false);
    }
  };
  
  const timeAgo = formatDistanceToNow(new Date(notification.created_at), {
    addSuffix: true,
    locale: ru,
  });
  
  // Определяем что показывать как основной текст
  // Для attention_zone (молчуны, новички) - description это имя участника
  // Для notification_rule (AI) - description это summary анализа
  const isAttentionZone = notification.source_type === 'attention_zone';
  const primaryText = notification.description;
  
  // Подсказка из metadata или конфига
  const hint = isAttentionZone 
    ? config.hint 
    : (notification.metadata?.summary as string) || config.hint;
  
  return (
    <Card 
      className={`border-l-4 transition-all ${config.borderColor} ${config.bgColor} ${
        isResolved ? 'opacity-50' : ''
      }`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={`flex-shrink-0 mt-0.5 ${config.iconColor}`}>
            {config.icon}
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header with type label and time */}
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-semibold ${config.iconColor}`}>
                {config.label}
              </span>
              <span className="text-xs text-gray-400">•</span>
              <span className="text-xs text-gray-500">{timeAgo}</span>
            </div>
            
            {/* Primary text (name or summary) */}
            <h3 className="text-sm font-medium text-gray-900 mb-1">
              {primaryText}
            </h3>
            
            {/* Hint text (only for AI notifications with different summary) */}
            {!isAttentionZone && hint && hint !== primaryText && (
              <p className="text-xs text-gray-500 line-clamp-2 mb-2">
                {hint}
              </p>
            )}
            
            {/* Link to participant/group */}
            <Link 
              href={notification.link_url}
              className="text-sm text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
            >
              Открыть профиль →
            </Link>
            
            {/* Resolved info */}
            {isResolved && (
              <div className="mt-2 text-xs text-green-700 flex items-center gap-1 bg-green-100 rounded px-2 py-1 w-fit">
                <Check className="h-3 w-3" />
                {notification.resolved_by_name 
                  ? `Решено: ${notification.resolved_by_name}` 
                  : 'Решено'}
              </div>
            )}
          </div>
          
          {/* Resolve button */}
          {!isResolved && (
            <div className="flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleResolve}
                disabled={isResolving}
                className="text-xs bg-white hover:bg-gray-50"
              >
                {isResolving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <Check className="h-3 w-3 mr-1" />
                    Решено
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

