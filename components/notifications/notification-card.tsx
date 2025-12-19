'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Check, AlertCircle, MessageCircle, Clock, Users, Calendar, Loader2 } from 'lucide-react';
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

function getNotificationIcon(type: string, severity: string) {
  switch (type) {
    case 'negative_discussion':
      return <AlertCircle className="h-5 w-5 text-red-500" />;
    case 'unanswered_question':
      return <MessageCircle className="h-5 w-5 text-amber-500" />;
    case 'group_inactive':
      return <Clock className="h-5 w-5 text-gray-500" />;
    case 'churning_participant':
      return <Users className="h-5 w-5 text-amber-500" />;
    case 'inactive_newcomer':
      return <Users className="h-5 w-5 text-blue-500" />;
    case 'critical_event':
      return <Calendar className="h-5 w-5 text-red-500" />;
    default:
      return <AlertCircle className="h-5 w-5 text-gray-500" />;
  }
}

function getSeverityColor(severity: string) {
  switch (severity) {
    case 'error':
    case 'high':
      return 'border-l-red-500 bg-red-50';
    case 'warning':
    case 'medium':
      return 'border-l-amber-500 bg-amber-50';
    case 'info':
    case 'low':
      return 'border-l-blue-500 bg-blue-50';
    default:
      return 'border-l-gray-300 bg-gray-50';
  }
}

function getTypeLabel(type: string): string {
  switch (type) {
    case 'negative_discussion':
      return 'Негатив в группе';
    case 'unanswered_question':
      return 'Неотвеченный вопрос';
    case 'group_inactive':
      return 'Неактивность группы';
    case 'churning_participant':
      return 'Участник на грани оттока';
    case 'inactive_newcomer':
      return 'Новичок без активности';
    case 'critical_event':
      return 'Критичное событие';
    default:
      return type;
  }
}

export default function NotificationCard({ notification, orgId, onResolve }: NotificationCardProps) {
  const [isResolving, setIsResolving] = useState(false);
  const isResolved = !!notification.resolved_at;
  
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
  
  return (
    <Card 
      className={`border-l-4 transition-all ${getSeverityColor(notification.severity)} ${
        isResolved ? 'opacity-60' : ''
      }`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="flex-shrink-0 mt-0.5">
            {getNotificationIcon(notification.notification_type, notification.severity)}
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {getTypeLabel(notification.notification_type)}
              </span>
              <span className="text-xs text-gray-400">•</span>
              <span className="text-xs text-gray-500">{timeAgo}</span>
            </div>
            
            {/* Title & Description */}
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              {notification.title}
            </h3>
            <p className="text-sm text-gray-600 line-clamp-2 mb-2">
              {notification.description}
            </p>
            
            {/* Link */}
            <Link 
              href={notification.link_url}
              className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"
            >
              {notification.link_text}
              <span className="text-xs">→</span>
            </Link>
            
            {/* Resolved info */}
            {isResolved && notification.resolved_by_name && (
              <div className="mt-2 text-xs text-gray-500 flex items-center gap-1">
                <Check className="h-3 w-3 text-green-600" />
                Решено: {notification.resolved_by_name}
                {notification.resolved_at && (
                  <span className="text-gray-400">
                    {' '}• {formatDistanceToNow(new Date(notification.resolved_at), {
                      addSuffix: true,
                      locale: ru,
                    })}
                  </span>
                )}
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
                className="text-xs"
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

