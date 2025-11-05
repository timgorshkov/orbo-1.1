'use client'

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ParticipantDetailResult } from '@/lib/types/participant';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

interface ParticipantActivityTimelineProps {
  detail: ParticipantDetailResult;
  limit?: number;
  compact?: boolean;
}

export default function ParticipantActivityTimeline({ detail, limit, compact }: ParticipantActivityTimelineProps) {
  const events = useMemo(() => {
    const list = detail.events || [];
    return typeof limit === 'number' ? list.slice(0, limit) : list;
  }, [detail.events, limit]);

  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-neutral-500">
          Нет событий
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      {!compact && (
        <CardHeader>
          <CardTitle>Активность</CardTitle>
        </CardHeader>
      )}
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {events.map(event => {
            const formatted = event.created_at
              ? format(new Date(event.created_at), 'dd MMM yyyy, HH:mm', { locale: ru })
              : '';

            const label = event.event_type === 'message'
              ? 'Сообщение'
              : event.event_type === 'join'
              ? 'Вступление'
              : event.event_type === 'leave'
              ? 'Выход'
              : event.event_type === 'reaction'
              ? 'Реакция'
              : event.event_type;

            // Extract useful info from meta
            let messageText = '';
            let replyToId = '';
            let groupName = '';
            
            if (event.meta) {
              // Try to get message text
              if (event.meta.message?.text_preview) {
                messageText = event.meta.message.text_preview.slice(0, 60);
                if (event.meta.message.text_preview.length > 60) messageText += '...';
              } else if (event.meta.message?.text) {
                messageText = String(event.meta.message.text).slice(0, 60);
                if (String(event.meta.message.text).length > 60) messageText += '...';
              }
              
              // Try to get reply info (thread)
              if (event.meta.message?.reply_to_id) {
                replyToId = `#${event.meta.message.reply_to_id}`;
              } else if (event.meta.reply_to_message_id) {
                replyToId = `#${event.meta.reply_to_message_id}`;
              }
              
              // Try to get group name
              if (event.meta.group_title) {
                groupName = String(event.meta.group_title);
              } else if (event.meta.chat?.title) {
                groupName = String(event.meta.chat.title);
              }
            }

            // Build compact one-line description
            const parts = [formatted, label];
            if (groupName) parts.push(groupName);
            else if (event.tg_chat_id) parts.push(`ID: ${event.tg_chat_id}`);
            if (replyToId) parts.push(`→ ${replyToId}`);
            if (messageText) parts.push(`"${messageText}"`);

            return (
              <div key={event.id} className="flex items-start gap-2 text-sm text-gray-700 py-1 hover:bg-gray-50 rounded px-2">
                <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                <div className="flex-1 truncate">
                  {parts.join(' • ')}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
