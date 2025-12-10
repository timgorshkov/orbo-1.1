'use client'

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { ParticipantDetailResult } from '@/lib/types/participant';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { MessageSquare, UserPlus, UserMinus, Heart, ChevronDown, Phone } from 'lucide-react';

interface ParticipantActivityTimelineProps {
  detail: ParticipantDetailResult;
  limit?: number;
  compact?: boolean;
}

// Default items per page
const ITEMS_PER_PAGE = 50;
const MAX_EVENTS_LOADED = 200; // Server-side limit

export default function ParticipantActivityTimeline({ detail, limit, compact }: ParticipantActivityTimelineProps) {
  const [visibleCount, setVisibleCount] = useState(limit || ITEMS_PER_PAGE);
  
  // Build a map of chat_id -> group_title from detail.groups
  const groupNamesMap = useMemo(() => {
    const map = new Map<string, string>();
    if (detail.groups) {
      detail.groups.forEach(g => {
        if (g.tg_chat_id && g.title) {
          map.set(String(g.tg_chat_id), g.title);
        }
      });
    }
    return map;
  }, [detail.groups]);

  const allEvents = detail.events || [];
  const events = useMemo(() => {
    return allEvents.slice(0, visibleCount);
  }, [allEvents, visibleCount]);

  const hasMore = visibleCount < allEvents.length;
  const totalLoaded = allEvents.length;

  if (allEvents.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-neutral-500">
          Нет событий
        </CardContent>
      </Card>
    );
  }

  const loadMore = () => {
    setVisibleCount(prev => Math.min(prev + ITEMS_PER_PAGE, allEvents.length));
  };

  // Get event icon based on type and source
  const getEventIcon = (eventType: string, source?: string) => {
    // WhatsApp has special icon
    if (source === 'whatsapp') {
      return <Phone className="h-3.5 w-3.5 text-green-600" />;
    }
    
    switch (eventType) {
      case 'message':
        return <MessageSquare className="h-3.5 w-3.5 text-blue-500" />;
      case 'join':
        return <UserPlus className="h-3.5 w-3.5 text-green-500" />;
      case 'leave':
        return <UserMinus className="h-3.5 w-3.5 text-red-500" />;
      case 'reaction':
        return <Heart className="h-3.5 w-3.5 text-pink-500" />;
      default:
        return <div className="h-1.5 w-1.5 rounded-full bg-gray-400" />;
    }
  };

  // Get label only for non-message events
  const getEventLabel = (eventType: string) => {
    switch (eventType) {
      case 'join':
        return 'Вступил в группу';
      case 'leave':
        return 'Вышел из группы';
      case 'reaction':
        return 'Поставил реакцию';
      default:
        return null; // No label for messages - text is enough
    }
  };

  return (
    <Card>
      {!compact && (
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle>Активность</CardTitle>
            <span className="text-xs text-gray-500">
              {totalLoaded >= MAX_EVENTS_LOADED 
                ? `последние ${MAX_EVENTS_LOADED} событий` 
                : `${totalLoaded} событий`}
            </span>
          </div>
        </CardHeader>
      )}
      <CardContent className="space-y-2 pt-2">
        {events.map(event => {
          const formatted = event.created_at
            ? format(new Date(event.created_at), 'd MMM, HH:mm', { locale: ru })
            : '';

          // Extract useful info from meta
          let messageText = '';
          let replyIndicator = '';
          const source = event.meta?.source as string | undefined;
          const isWhatsApp = source === 'whatsapp' || event.tg_chat_id === 'whatsapp';
          
          if (event.meta) {
            // Try to get message text - check multiple locations
            // WhatsApp stores in meta.text directly
            if (event.meta.text) {
              const text = String(event.meta.text);
              messageText = text.slice(0, 80);
              if (text.length > 80) messageText += '...';
            } else if (event.meta.message?.text_preview) {
              messageText = event.meta.message.text_preview.slice(0, 80);
              if (event.meta.message.text_preview.length > 80) messageText += '...';
            } else if (event.meta.message?.text) {
              messageText = String(event.meta.message.text).slice(0, 80);
              if (String(event.meta.message.text).length > 80) messageText += '...';
            }
            
            // Check if it's a reply
            if (event.meta.message?.reply_to_id || event.meta.reply_to_message_id) {
              replyIndicator = '↩';
            }
          }

          // Get group name: first from map, then from meta, then show nothing
          let groupName = '';
          if (isWhatsApp) {
            // WhatsApp: get group name from meta
            groupName = event.meta?.group_name || 'WhatsApp';
          } else if (event.tg_chat_id) {
            groupName = groupNamesMap.get(String(event.tg_chat_id)) || '';
          }
          if (!groupName && event.meta?.group_title) {
            groupName = String(event.meta.group_title);
          } else if (!groupName && event.meta?.chat?.title) {
            groupName = String(event.meta.chat.title);
          }

          const eventLabel = getEventLabel(event.event_type);

          return (
            <div key={event.id} className="flex items-start gap-2 text-sm py-1.5 hover:bg-gray-50 rounded px-2 -mx-2">
              <div className="mt-0.5 flex-shrink-0">
                {getEventIcon(event.event_type, isWhatsApp ? 'whatsapp' : undefined)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-gray-400 flex-shrink-0">{formatted}</span>
                  {groupName && (
                    <span className="text-xs text-gray-500 truncate">• {groupName}</span>
                  )}
                  {replyIndicator && (
                    <span className="text-xs text-blue-500">{replyIndicator}</span>
                  )}
                </div>
                {eventLabel ? (
                  <div className="text-gray-600">{eventLabel}</div>
                ) : messageText ? (
                  <div className="text-gray-700 truncate">{messageText}</div>
                ) : null}
              </div>
            </div>
          );
        })}

        {/* Load More Button */}
        {hasMore && (
          <div className="pt-2 flex justify-center">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={loadMore}
              className="text-gray-500 hover:text-gray-700"
            >
              <ChevronDown className="h-4 w-4 mr-1" />
              Показать ещё ({Math.min(ITEMS_PER_PAGE, allEvents.length - visibleCount)})
            </Button>
          </div>
        )}

        {/* Info about limit */}
        {!hasMore && totalLoaded >= MAX_EVENTS_LOADED && (
          <p className="text-xs text-center text-gray-400 pt-2">
            Показаны последние {MAX_EVENTS_LOADED} событий
          </p>
        )}
      </CardContent>
    </Card>
  );
}
