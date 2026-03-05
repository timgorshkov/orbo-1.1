'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppWindow, ExternalLink, LogIn } from 'lucide-react';

interface Organization {
  id: string;
  name: string;
  public_description: string | null;
  logo_url: string | null;
  portal_cover_url: string | null;
  telegram_group_link: string | null;
}

interface Event {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string;
  cover_image_url: string | null;
  is_public: boolean;
}

interface App {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
}

interface Props {
  orgId: string;
}

function getInitials(name: string) {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

function isUrl(value: string) {
  return value.startsWith('http://') || value.startsWith('https://');
}

function formatEventDate(eventDate: string | null | undefined, startTime: string | null | undefined) {
  if (!eventDate) return '';
  const date = new Date(`${eventDate}T00:00:00`);
  if (isNaN(date.getTime())) return eventDate;
  const dateStr = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  const time = startTime ? startTime.substring(0, 5) : '';
  return time ? `${dateStr}, ${time}` : dateStr;
}

function stripMarkdown(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .trim();
}

export default function PublicCommunityHub({ orgId }: Props) {
  const [org, setOrg] = useState<Organization | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchCommunityData();
  }, [orgId]);

  const fetchCommunityData = async () => {
    try {
      setIsLoading(true);

      const [orgRes, eventsRes, appsRes] = await Promise.all([
        fetch(`/api/organizations/${orgId}/public`),
        fetch(`/api/events?orgId=${orgId}&status=published&public=true&upcoming=true&limit=3`),
        fetch(`/api/apps?orgId=${orgId}`),
      ]);

      if (orgRes.ok) {
        const { organization } = await orgRes.json();
        setOrg(organization);
      }
      if (eventsRes.ok) {
        const { events: evList } = await eventsRes.json();
        setEvents(evList || []);
      }
      if (appsRes.ok) {
        const { apps: appList } = await appsRes.json();
        setApps((appList || []).slice(0, 4));
      }
    } catch (error) {
      console.error('Error fetching community data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3" />
          <p className="text-sm text-neutral-500">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!org) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <h1 className="text-xl font-bold text-neutral-900 mb-2">Сообщество не найдено</h1>
          <p className="text-sm text-neutral-500">Проверьте правильность ссылки</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-16">
      {/* Hero */}
      {org.portal_cover_url ? (
        <div className="h-48 w-full overflow-hidden">
          <img src={org.portal_cover_url} alt="" className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="h-32 w-full bg-gradient-to-r from-neutral-100 to-neutral-200" />
      )}

      <div className="bg-white">
        <div className="max-w-5xl mx-auto px-6">
          {/* Circular logo overlapping cover */}
          <div className="-mt-8 mb-3 w-16 h-16 rounded-full ring-4 ring-white shadow-md overflow-hidden flex-shrink-0 bg-neutral-200">
            {org.logo_url ? (
              <img src={org.logo_url} alt={org.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-neutral-300">
                <span className="text-neutral-600 font-semibold text-sm">{getInitials(org.name)}</span>
              </div>
            )}
          </div>

          {/* Name + description on white */}
          <div className="pb-5 border-b border-neutral-100">
            <h1 className="text-xl font-bold text-neutral-900">{org.name}</h1>
            {org.public_description && (
              <p className="text-sm text-neutral-500 mt-0.5">{org.public_description}</p>
            )}
          </div>
        </div>
      </div>

      {/* CTA buttons */}
      <div className="max-w-5xl mx-auto px-6 mt-5">
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/p/${orgId}/auth`}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <LogIn className="w-4 h-4" />
            Войти как участник
          </Link>
          {org.telegram_group_link && (
            <a
              href={org.telegram_group_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-900 text-sm font-medium rounded-lg transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Присоединиться к группе
            </a>
          )}
        </div>
      </div>

      {/* Content sections */}
      <div className="space-y-8 mt-8">
        {/* Upcoming events */}
        {events.length > 0 && (
          <section className="max-w-5xl mx-auto px-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-neutral-900">Ближайшие события</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="bg-white rounded-xl border border-neutral-200 overflow-hidden"
                >
                  {event.cover_image_url && (
                    <div className="h-36 w-full overflow-hidden">
                      <img
                        src={event.cover_image_url}
                        alt={event.title}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}
                  <div className="p-4">
                    <p className="text-xs text-blue-600 font-medium mb-1">
                      {formatEventDate(event.event_date, event.start_time)}
                    </p>
                    <h3 className="font-semibold text-sm text-neutral-900 line-clamp-2">
                      {event.title}
                    </h3>
                    {event.description && (
                      <p className="text-xs text-neutral-500 mt-1.5 line-clamp-2">
                        {stripMarkdown(event.description)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Apps */}
        {apps.length > 0 && (
          <section className="max-w-5xl mx-auto px-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-neutral-900">Приложения</h2>
              <Link href={`/p/${orgId}/apps`} className="text-sm text-blue-600 hover:text-blue-700">
                Все приложения →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {apps.map((app) => (
                <div
                  key={app.id}
                  className="flex items-start gap-3 bg-white rounded-xl border border-neutral-200 p-4"
                >
                  {app.icon && isUrl(app.icon) ? (
                    <img src={app.icon} alt={app.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                  ) : app.icon ? (
                    <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center flex-shrink-0 text-2xl">
                      {app.icon}
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center flex-shrink-0">
                      <AppWindow className="w-5 h-5 text-neutral-400" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-neutral-900">{app.name}</p>
                    {app.description && (
                      <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{app.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {events.length === 0 && apps.length === 0 && (
          <div className="max-w-5xl mx-auto px-6 text-center py-8">
            <p className="text-sm text-neutral-500">Скоро здесь появятся события и приложения</p>
          </div>
        )}

        {/* Login nudge */}
        {(events.length > 0 || apps.length > 0) && (
          <div className="max-w-5xl mx-auto px-6">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 text-center">
              <p className="text-sm text-blue-900 mb-3">
                Войдите, чтобы видеть больше контента и регистрироваться на события
              </p>
              <Link
                href={`/p/${orgId}/auth`}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <LogIn className="w-4 h-4" />
                Войти как участник
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-neutral-100 mt-16 py-6">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <p className="text-xs text-neutral-400">
            Создано на платформе{' '}
            <a
              href="https://www.orbo.ru"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium hover:text-blue-600 transition-colors"
            >
              Orbo
            </a>
            {' '}— инструменты для Telegram-сообществ
          </p>
        </div>
      </footer>
    </div>
  );
}
