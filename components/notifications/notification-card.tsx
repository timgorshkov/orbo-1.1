'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Check, AlertTriangle, MessageCircle, Clock, Calendar, Loader2, UserMinus, UserX, ExternalLink } from 'lucide-react';
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

const NOTIFICATION_CONFIG: Record<string, {
  icon: React.ReactNode;
  label: string;
  accentColor: string;
  bgColor: string;
  iconColor: string;
}> = {
  negative_discussion: {
    icon: <AlertTriangle className="h-4 w-4" />,
    label: 'Негатив',
    accentColor: 'border-l-red-500',
    bgColor: 'bg-red-50/60',
    iconColor: 'text-red-600',
  },
  critical_event: {
    icon: <Calendar className="h-4 w-4" />,
    label: 'Низкая регистрация',
    accentColor: 'border-l-red-500',
    bgColor: 'bg-red-50/60',
    iconColor: 'text-red-600',
  },
  unanswered_question: {
    icon: <MessageCircle className="h-4 w-4" />,
    label: 'Неотвеченный вопрос',
    accentColor: 'border-l-amber-400',
    bgColor: 'bg-amber-50/60',
    iconColor: 'text-amber-600',
  },
  group_inactive: {
    icon: <Clock className="h-4 w-4" />,
    label: 'Неактивность',
    accentColor: 'border-l-orange-200',
    bgColor: 'bg-orange-50/50',
    iconColor: 'text-orange-400',
  },
  churning_participant: {
    icon: <UserMinus className="h-4 w-4" />,
    label: 'Отток',
    accentColor: 'border-l-orange-200',
    bgColor: 'bg-orange-50/50',
    iconColor: 'text-orange-400',
  },
  inactive_newcomer: {
    icon: <UserX className="h-4 w-4" />,
    label: 'Новичок',
    accentColor: 'border-l-orange-200',
    bgColor: 'bg-orange-50/50',
    iconColor: 'text-orange-400',
  },
};

const DEFAULT_CONFIG = {
  icon: <AlertTriangle className="h-4 w-4" />,
  label: 'Уведомление',
  accentColor: 'border-l-gray-400',
  bgColor: 'bg-gray-50',
  iconColor: 'text-gray-600',
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

  const meta = notification.metadata || {};
  const isAttentionZone = notification.source_type === 'attention_zone';

  const sampleMessages = Array.isArray(meta.sample_messages) ? meta.sample_messages as string[] : [];
  const questionAuthor = meta.question_author as string | undefined;
  const questionAuthorId = meta.question_author_id as string | undefined;
  const inactiveHours = meta.inactive_hours as number | undefined;
  const groupTitle = meta.group_title as string | undefined;
  const severity = meta.severity as string | undefined;

  const linkUrl = notification.link_url;
  const isExternalLink = linkUrl?.startsWith('https://t.me');
  const isProfileLink = linkUrl?.includes('/members/');
  const participantNameAsLink = isAttentionZone && isProfileLink;

  return (
    <div className={`border-l-4 rounded-lg ${config.accentColor} ${config.bgColor} ${
      isResolved ? 'opacity-60' : ''
    } p-3`}>
      <div className="flex items-start gap-2.5">
        <div className={`flex-shrink-0 mt-0.5 ${config.iconColor}`}>
          {config.icon}
        </div>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold ${config.iconColor}`}>{config.label}</span>
            {groupTitle && <span className="text-xs text-gray-500">{groupTitle}</span>}
            <span className="text-xs text-gray-400">{timeAgo}</span>
            {severity && severity !== 'low' && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                severity === 'high' ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800'
              }`}>
                {severity === 'high' ? 'высокая' : 'средняя'}
              </span>
            )}
            {/* TG-ссылка в header: не для вопросов (у них — inline с автором) */}
            {isExternalLink && notification.notification_type !== 'unanswered_question' && (
              <a href={linkUrl} target="_blank" rel="noopener noreferrer"
                className="ml-auto text-xs text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-0.5 flex-shrink-0">
                <ExternalLink className="w-3 h-3" /> Telegram
              </a>
            )}
          </div>

          {/* Description: для attention_zone — description = имя участника */}
          {participantNameAsLink ? (
            <div className="mt-0.5 text-sm">
              <Link href={linkUrl} className="font-medium text-blue-700 hover:underline">
                {notification.description.split(' — ')[0]}
              </Link>
              {notification.description.includes(' — ') && (
                <span className="text-gray-500"> — {notification.description.split(' — ').slice(1).join(' — ')}</span>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-800 mt-0.5 leading-snug">
              {notification.description}
            </p>
          )}

          {/* Вопрос: автор + ссылка на сообщение через тире */}
          {notification.notification_type === 'unanswered_question' && questionAuthor && (
            <div className="text-sm text-gray-600 mt-0.5">
              {questionAuthorId ? (
                <Link href={`/p/${orgId}/members/${questionAuthorId}`} className="text-blue-600 hover:underline">
                  {questionAuthor}
                </Link>
              ) : (
                <span>{questionAuthor}</span>
              )}
              {isExternalLink && (
                <>
                  <span className="text-gray-400 mx-1">—</span>
                  <a href={linkUrl} target="_blank" rel="noopener noreferrer"
                    className="text-blue-600 hover:underline inline-flex items-center gap-0.5">
                    <ExternalLink className="w-3 h-3" /> сообщение
                  </a>
                </>
              )}
            </div>
          )}

          {/* Негатив: цитаты */}
          {notification.notification_type === 'negative_discussion' && sampleMessages.length > 0 && (
            <div className="mt-1.5 pl-2 border-l-2 border-red-300 space-y-0.5">
              {sampleMessages.slice(0, 2).map((msg, i) => (
                <p key={i} className="text-xs text-gray-600 italic line-clamp-1">«{msg}»</p>
              ))}
              {sampleMessages.length > 2 && (
                <span className="text-[11px] text-gray-400">+{sampleMessages.length - 2} ещё</span>
              )}
            </div>
          )}

          {/* Неактивность: часы */}
          {inactiveHours && notification.notification_type === 'group_inactive' && (
            <span className="text-xs text-gray-500 mt-0.5 block">{inactiveHours} ч. без сообщений</span>
          )}

          {/* Resolved */}
          {isResolved && notification.resolved_by_name && (
            <span className="text-[11px] text-green-700 mt-1 inline-flex items-center gap-1">
              <Check className="h-3 w-3" /> {notification.resolved_by_name}
            </span>
          )}
        </div>

        {!isResolved && (
          <button
            onClick={handleResolve}
            disabled={isResolving}
            className="flex-shrink-0 p-1.5 rounded-md hover:bg-white/80 text-gray-400 hover:text-green-600 transition-colors disabled:opacity-50"
            title="Отметить как решённое"
          >
            {isResolving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  );
}
