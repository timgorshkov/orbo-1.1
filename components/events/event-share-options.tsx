'use client';

import { useState, useRef, useEffect } from 'react';
import { Share2, Link as LinkIcon, Copy, Check, MessageCircle, ExternalLink, Send, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EventShareOptionsProps {
  eventId: string;
  eventTitle: string;
  orgId: string;
  isPublic?: boolean;
  maxEventLink?: string | null;
  /** YYYY-MM-DD */
  eventDate?: string | null;
  /** HH:MM */
  eventStartTime?: string | null;
}

export default function EventShareOptions({
  eventId,
  eventTitle,
  orgId,
  isPublic = true,
  maxEventLink = null,
  eventDate = null,
  eventStartTime = null,
}: EventShareOptionsProps) {
  const [copiedWeb, setCopiedWeb] = useState(false);
  const [copiedTelegram, setCopiedTelegram] = useState(false);
  const [copiedMax, setCopiedMax] = useState(false);
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Reminder dialog state
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [useMiniAppLink, setUseMiniAppLink] = useState(true);
  const [reminderLoading, setReminderLoading] = useState(false);
  const [reminderResult, setReminderResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Generate links
  const webLink = `${typeof window !== 'undefined' ? window.location.origin : 'https://my.orbo.ru'}/e/${eventId}`;
  const telegramBotUsername = process.env.NEXT_PUBLIC_TELEGRAM_EVENT_BOT_USERNAME || 'orbo_event_bot';
  const telegramAppShortName = process.env.NEXT_PUBLIC_TELEGRAM_EVENT_APP_SHORT_NAME || 'events';
  const telegramLink = `https://t.me/${telegramBotUsername}/${telegramAppShortName}?startapp=e-${eventId}`;

  // Compute reminder datetimes for display
  const eventStart = eventDate && eventStartTime
    ? new Date(`${eventDate}T${eventStartTime}:00+03:00`)
    : null;

  const fmt = (d: Date) =>
    d.toLocaleString('ru-RU', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      timeZone: 'Europe/Moscow',
    });

  const time24h = eventStart
    ? (() => { const d = new Date(eventStart); d.setDate(d.getDate() - 1); return fmt(d); })()
    : null;
  const time1h = eventStart
    ? (() => { const d = new Date(eventStart); d.setHours(d.getHours() - 1); return fmt(d); })()
    : null;

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const copyToClipboard = async (text: string, type: 'web' | 'telegram' | 'max') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'web') {
        setCopiedWeb(true);
        setTimeout(() => setCopiedWeb(false), 2000);
      } else if (type === 'telegram') {
        setCopiedTelegram(true);
        setTimeout(() => setCopiedTelegram(false), 2000);
      } else {
        setCopiedMax(true);
        setTimeout(() => setCopiedMax(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleOpenReminderDialog = () => {
    setOpen(false);
    setReminderResult(null);
    setShowReminderDialog(true);
  };

  const handleCreateReminders = async () => {
    setReminderLoading(true);
    setReminderResult(null);
    try {
      const res = await fetch(`/api/events/${eventId}/create-reminders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ use_miniapp_link: useMiniAppLink }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReminderResult({ ok: false, message: data.error || 'Ошибка при создании анонсов' });
      } else {
        const label = data.created?.length > 0
          ? `Созданы напоминания: ${data.created.join(' и ')}`
          : 'Напоминания созданы';
        setReminderResult({ ok: true, message: label });
      }
    } catch {
      setReminderResult({ ok: false, message: 'Ошибка сети' });
    } finally {
      setReminderLoading(false);
    }
  };

  return (
    <>
      <div className="relative">
        <button
          ref={triggerRef}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 px-3"
          onClick={() => setOpen(!open)}
        >
          <Share2 className="h-4 w-4" />
          Поделиться
        </button>

        {open && (
          <div
            ref={popoverRef}
            className="absolute right-0 top-full mt-2 w-72 bg-white rounded-lg border border-gray-200 shadow-lg z-50"
          >
            <div className="p-2">
              <p className="px-2 py-1.5 text-xs text-gray-500">
                Поделиться ссылкой на событие
              </p>

              <div className="h-px bg-gray-100 my-1" />

              {/* Web link */}
              <button
                onClick={() => copyToClipboard(webLink, 'web')}
                className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-gray-100 transition-colors text-left"
              >
                <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <LinkIcon className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Веб-ссылка</p>
                  <p className="text-xs text-gray-500 truncate">{webLink}</p>
                </div>
                <div className="flex-shrink-0">
                  {copiedWeb ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4 text-gray-400" />
                  )}
                </div>
              </button>

              {/* Telegram MiniApp link */}
              <button
                onClick={() => copyToClipboard(telegramLink, 'telegram')}
                className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-gray-100 transition-colors text-left"
              >
                <div className="flex-shrink-0 w-8 h-8 bg-sky-100 rounded-lg flex items-center justify-center">
                  <MessageCircle className="h-4 w-4 text-sky-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Telegram MiniApp</p>
                  <p className="text-xs text-gray-500 truncate">{telegramLink}</p>
                </div>
                <div className="flex-shrink-0">
                  {copiedTelegram ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4 text-gray-400" />
                  )}
                </div>
              </button>

              {/* MAX MiniApp link */}
              {maxEventLink && (
                <button
                  onClick={() => copyToClipboard(maxEventLink, 'max')}
                  className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-gray-100 transition-colors text-left"
                >
                  <div className="flex-shrink-0 w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                    <Send className="h-4 w-4 text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">MAX MiniApp</p>
                    <p className="text-xs text-gray-500 truncate">{maxEventLink}</p>
                  </div>
                  <div className="flex-shrink-0">
                    {copiedMax ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                </button>
              )}

              <div className="h-px bg-gray-100 my-1" />

              {/* Open Telegram link */}
              <a
                href={telegramLink}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-gray-100 transition-colors"
              >
                <ExternalLink className="h-4 w-4 text-gray-400" />
                <span className="text-sm">Открыть в Telegram</span>
              </a>

              {/* Open MAX link */}
              {maxEventLink && (
                <a
                  href={maxEventLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-gray-100 transition-colors"
                >
                  <ExternalLink className="h-4 w-4 text-gray-400" />
                  <span className="text-sm">Открыть в MAX</span>
                </a>
              )}

              <div className="h-px bg-gray-100 my-1" />

              {/* Create reminders */}
              <button
                onClick={handleOpenReminderDialog}
                className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-gray-100 transition-colors text-left"
              >
                <Bell className="h-4 w-4 text-amber-500" />
                <span className="text-sm">Создать анонсы-напоминания</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Reminder creation dialog */}
      {showReminderDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-3">Создать анонсы-напоминания</h3>

            {!reminderResult ? (
              <>
                <p className="text-sm text-gray-600 mb-4">
                  Запланировать автоматические напоминания участникам в подключённые Telegram-группы:
                </p>

                <div className="bg-blue-50 rounded-lg p-3 mb-4 text-sm space-y-2">
                  <div className="flex items-center gap-2">
                    <span>🔔</span>
                    <span>
                      <strong>За 24 часа</strong>{time24h ? ` — ${time24h}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>⏰</span>
                    <span>
                      <strong>За 1 час</strong>{time1h ? ` — ${time1h}` : ''}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-gray-500 mb-4">
                  Напоминания, время которых уже прошло, созданы не будут. Вы сможете отредактировать текст или выбрать конкретные группы в разделе «Анонсы».
                </p>

                {/* Link type */}
                <div className="mb-5 p-3 bg-gray-50 rounded-lg">
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Тип ссылки в анонсах:
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="reminderLinkType"
                        checked={useMiniAppLink}
                        onChange={() => setUseMiniAppLink(true)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-sm text-gray-700">🤖 MiniApp (t.me/orbo_event_bot)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="reminderLinkType"
                        checked={!useMiniAppLink}
                        onChange={() => setUseMiniAppLink(false)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-sm text-gray-700">🌐 Веб-страница (my.orbo.ru)</span>
                    </label>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    className="flex-1"
                    onClick={handleCreateReminders}
                    disabled={reminderLoading}
                  >
                    {reminderLoading ? 'Создаём...' : 'Создать'}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowReminderDialog(false)}
                    disabled={reminderLoading}
                  >
                    Отмена
                  </Button>
                </div>
              </>
            ) : (
              /* Result screen */
              <>
                <div className={`rounded-lg p-4 mb-5 text-sm ${reminderResult.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                  {reminderResult.ok ? '✓ ' : '✗ '}{reminderResult.message}
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowReminderDialog(false)}
                >
                  Закрыть
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
