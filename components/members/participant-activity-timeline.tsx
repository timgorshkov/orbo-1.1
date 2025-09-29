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
        <div className="space-y-3">
          {events.map(event => {
            const formatted = event.created_at
              ? format(new Date(event.created_at), compact ? 'dd.MM.yy HH:mm' : 'dd MMMM yyyy, HH:mm', { locale: ru })
              : '';

            const label = event.event_type === 'message'
              ? 'Сообщение'
              : event.event_type === 'join'
              ? 'Вступление'
              : event.event_type === 'leave'
              ? 'Выход'
              : event.event_type;

            const chatId = event.tg_chat_id ? String(event.tg_chat_id) : null;
            const metaPreview = event.meta ? JSON.stringify(event.meta).slice(0, 120) : null;

            return (
              <div key={event.id} className="flex items-start gap-3">
                <div className="mt-1 h-2 w-2 rounded-full bg-neutral-400" />
                <div>
                  <div className="text-sm font-medium text-neutral-800">{label}</div>
                  <div className="text-xs text-neutral-500">{formatted}</div>
                  {chatId && (
                    <div className="text-xs text-neutral-500">Группа: {chatId}</div>
                  )}
                  {metaPreview && (
                    <div className="text-xs text-neutral-400">{metaPreview}…</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
