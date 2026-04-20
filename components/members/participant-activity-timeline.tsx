'use client'

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { ParticipantDetailResult } from '@/lib/types/participant';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { MessageSquare, UserPlus, UserMinus, Heart, ChevronDown, Phone, MessageCircle, Send } from 'lucide-react';

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
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null); // null = все группы

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

  // Собрать группы с ненулевой активностью для фильтра
  const activeGroups = useMemo(() => {
    const groupCounts = new Map<string, { title: string; count: number }>();
    for (const e of allEvents) {
      const chatId = String(e.tg_chat_id || '');
      if (!chatId || chatId === '0') continue;
      const source = e.meta?.source as string | undefined;
      let title = '';
      if (source === 'whatsapp' || chatId === 'whatsapp') {
        title = e.meta?.group_name || 'WhatsApp';
      } else if (source === 'max' || chatId === 'max') {
        title = e.meta?.group_title || 'MAX';
      } else {
        title = groupNamesMap.get(chatId) || e.meta?.group_title || e.meta?.chat?.title || '';
      }
      if (!title) continue;
      const existing = groupCounts.get(chatId);
      if (existing) {
        existing.count++;
      } else {
        groupCounts.set(chatId, { title, count: 1 });
      }
    }
    return Array.from(groupCounts.entries())
      .map(([chatId, { title, count }]) => ({ chatId, title, count }))
      .sort((a, b) => b.count - a.count);
  }, [allEvents, groupNamesMap]);

  // Фильт��уем по выбранной группе
  const filteredEvents = useMemo(() => {
    if (!selectedGroup) return allEvents;
    return allEvents.filter((e) => String(e.tg_chat_id || '') === selectedGroup);
  }, [allEvents, selectedGroup]);

  const events = useMemo(() => {
    return filteredEvents.slice(0, visibleCount);
  }, [filteredEvents, visibleCount]);

  const hasMore = visibleCount < filteredEvents.length;
  const totalLoaded = filteredEvents.length;

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
    setVisibleCount(prev => Math.min(prev + ITEMS_PER_PAGE, filteredEvents.length));
  };

  // Get event icon based on type and source
  const getEventIcon = (eventType: string, source?: string, reactionEmoji?: string) => {
    if (source === 'whatsapp') {
      return <Phone className="h-3.5 w-3.5 text-green-600" />;
    }
    if (source === 'max') {
      return <Send className="h-3.5 w-3.5 text-indigo-500" />;
    }

    switch (eventType) {
      case 'message':
        return <MessageSquare className="h-3.5 w-3.5 text-blue-500" />;
      case 'channel_comment':
        return <MessageCircle className="h-3.5 w-3.5 text-purple-500" />;
      case 'join':
        return <UserPlus className="h-3.5 w-3.5 text-green-500" />;
      case 'leave':
        return <UserMinus className="h-3.5 w-3.5 text-red-500" />;
      case 'reaction':
        // Show reaction emoji instead of heart icon if available
        if (reactionEmoji) {
          return <span className="text-sm">{reactionEmoji}</span>;
        }
        return <Heart className="h-3.5 w-3.5 text-pink-500" />;
      default:
        return <MessageSquare className="h-3.5 w-3.5 text-gray-400" />;
    }
  };

  // Get label only for non-message events (returns null for messages so text is shown)
  const getEventLabel = (eventType: string, reactionEmoji?: string, targetText?: string) => {
    switch (eventType) {
      case 'join':
        return 'Вступил в группу';
      case 'leave':
        return 'Вышел из группы';
      case 'reaction':
        // Show what was reacted to
        if (targetText) {
          const truncated = targetText.length > 50 ? targetText.slice(0, 50) + '...' : targetText;
          return `на «${truncated}»`;
        }
        return null; // Just show emoji icon without label
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
        {/* Фильтр по группам */}
        {activeGroups.length > 1 && (
          <div className="flex flex-wrap gap-1.5 pb-2 border-b border-gray-100 mb-2">
            <button
              onClick={() => { setSelectedGroup(null); setVisibleCount(limit || ITEMS_PER_PAGE); }}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                !selectedGroup
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Все группы
            </button>
            {activeGroups.map((g) => (
              <button
                key={g.chatId}
                onClick={() => { setSelectedGroup(g.chatId === selectedGroup ? null : g.chatId); setVisibleCount(limit || ITEMS_PER_PAGE); }}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors truncate max-w-48 ${
                  selectedGroup === g.chatId
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                title={`${g.title} (${g.count})`}
              >
                {g.title} <span className="text-gray-400 ml-0.5">{g.count}</span>
              </button>
            ))}
          </div>
        )}

        {events.map(event => {
          // Format date: include year if not current year
          let formatted = '';
          if (event.created_at) {
            const eventDate = new Date(event.created_at);
            const currentYear = new Date().getFullYear();
            const eventYear = eventDate.getFullYear();
            
            if (eventYear === currentYear) {
              formatted = format(eventDate, 'd MMM, HH:mm', { locale: ru });
            } else {
              // Include year for past years
              formatted = format(eventDate, 'd MMM yyyy, HH:mm', { locale: ru });
            }
          }

          // Extract useful info from meta
          let messageText = '';
          let replyIndicator = '';
          let reactionEmoji = '';
          let reactionTargetText = '';
          const source = event.meta?.source as string | undefined;
          const isWhatsApp = source === 'whatsapp' || event.tg_chat_id === 'whatsapp';
          const isMax = source === 'max' || event.tg_chat_id === 'max';
          
          if (event.meta) {
            if (event.event_type === 'reaction') {
              reactionEmoji = event.meta.emoji || 
                              event.meta.reaction?.emoji ||
                              (Array.isArray(event.meta.reaction?.reaction_types) && event.meta.reaction.reaction_types[0]) ||
                              (Array.isArray(event.meta.reaction_types) && event.meta.reaction_types[0]) ||
                              (event.meta.reaction?.delta > 0 && event.meta.reaction?.new_reactions?.[0]?.emoji) ||
                              '👍';
              reactionTargetText = event.meta.target_text || 
                                   event.meta.message_text ||
                                   event.meta.original_message?.text || '';
            }
          }
          
          // Message text: prefer top-level field (from participant_messages), fall back to meta for WhatsApp/channel
          const rawText = event.message_text || event.meta?.text || event.meta?.text_preview || '';
          if (rawText) {
            const text = String(rawText);
            messageText = text.slice(0, 80);
            if (text.length > 80) messageText += '...';
          }
          
          // Show reply indicator only for actual replies, not for forum topic messages
          // (Telegram sets reply_to_message_id on all topic messages pointing to the topic root)
          if (event.reply_to_message_id && !event.topic_title) {
            replyIndicator = '↩';
          }

          // Get group/channel name: first from map, then from meta, then show nothing
          let groupName = '';
          if (isMax) {
            groupName = event.meta?.group_title || 'MAX';
          } else if (isWhatsApp) {
            groupName = event.meta?.group_name || 'WhatsApp';
          } else if (event.event_type === 'channel_comment' && event.meta?.channel_title) {
            // Channel comment: show channel name
            groupName = String(event.meta.channel_title);
          } else if (event.tg_chat_id) {
            groupName = groupNamesMap.get(String(event.tg_chat_id)) || '';
          }
          if (!groupName && event.meta?.group_title) {
            groupName = String(event.meta.group_title);
          } else if (!groupName && event.meta?.chat?.title) {
            groupName = String(event.meta.chat.title);
          }

          // Topic name — only for real forum topics (resolved from telegram_topics table).
          // If topic_title is empty, message_thread_id is a reply thread — handled by ↩ indicator.
          const topicName = event.topic_title || '';

          const eventLabel = getEventLabel(event.event_type, reactionEmoji, reactionTargetText);

          return (
            <div key={event.id} className="flex items-center gap-2 text-sm py-1 hover:bg-gray-50 rounded px-2 -mx-2">
              <div className="flex-shrink-0">
                {getEventIcon(event.event_type, isMax ? 'max' : isWhatsApp ? 'whatsapp' : undefined, reactionEmoji)}
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">{formatted}</span>
              {groupName && (
                <span className="text-xs text-gray-500 flex-shrink-0 max-w-24 truncate">{groupName}</span>
              )}
              {topicName && (
                <span className="text-xs text-indigo-500 flex-shrink-0 max-w-24 truncate">#{topicName}</span>
              )}
              {replyIndicator && (
                <span className="text-xs text-blue-500 flex-shrink-0">{replyIndicator}</span>
              )}
              {event.event_type === 'reaction' ? (
                // For reactions: show label with target text if available
                eventLabel ? (
                  <span className="text-gray-600 truncate flex-1">{eventLabel}</span>
                ) : null
              ) : eventLabel ? (
                // For join/leave events
                <span className="text-gray-600 truncate">{eventLabel}</span>
              ) : messageText ? (
                // For messages and channel comments
                <span className="text-gray-700 truncate flex-1">{messageText}</span>
              ) : null}
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
              Показать ещё ({Math.min(ITEMS_PER_PAGE, filteredEvents.length - visibleCount)})
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
