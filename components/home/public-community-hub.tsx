'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Calendar, AppWindow, ChevronRight, ExternalLink, LogIn } from 'lucide-react';
import VisibilityBadge from '@/components/apps/visibility-badge';

interface Organization {
  id: string;
  name: string;
  public_description: string | null;
  telegram_group_link: string | null;
}

interface Event {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  is_public: boolean;
}

interface App {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  visibility: 'public' | 'members' | 'private';
}

interface Props {
  orgId: string
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

      // Fetch organization info
      const orgResponse = await fetch(`/api/organizations/${orgId}/public`);
      if (orgResponse.ok) {
        const orgData = await orgResponse.json();
        setOrg(orgData.organization);
      }

      // Fetch upcoming events (top 3)
      const eventsResponse = await fetch(`/api/events?orgId=${orgId}&limit=3&upcoming=true`);
      if (eventsResponse.ok) {
        const eventsData = await eventsResponse.json();
        setEvents(eventsData.events || []);
      }

      // Fetch apps (top 3 by created_at)
      const appsResponse = await fetch(`/api/apps?orgId=${orgId}`);
      if (appsResponse.ok) {
        const appsData = await appsResponse.json();
        setApps((appsData.apps || []).slice(0, 3));
      }
    } catch (error) {
      console.error('Error fetching community data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!org) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Сообщество не найдено
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Проверьте правильность ссылки
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Hero Section */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-4 py-12 md:py-16">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
              {org.name}
            </h1>
            {org.public_description && (
              <p className="text-lg md:text-xl text-gray-600 dark:text-gray-400 mb-8">
                {org.public_description}
              </p>
            )}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href={`/p/${orgId}/auth`}
                className="inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                <LogIn className="w-5 h-5 mr-2" />
                Войти как участник
              </Link>
              {org.telegram_group_link && (
                <a
                  href={org.telegram_group_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-6 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white font-medium rounded-lg transition-colors"
                >
                  <ExternalLink className="w-5 h-5 mr-2" />
                  Присоединиться к Telegram
                </a>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto space-y-16">
          {/* Upcoming Events */}
          {events.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                  <Calendar className="w-8 h-8 text-blue-600" />
                  Ближайшие события
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6"
                  >
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                      {event.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                      {new Date(event.starts_at).toLocaleDateString('ru-RU', {
                        day: 'numeric',
                        month: 'long',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    {event.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                        {event.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Apps */}
          {apps.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                  <AppWindow className="w-8 h-8 text-green-600" />
                  Приложения
                </h2>
                <Link
                  href={`/p/${orgId}/apps`}
                  className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium flex items-center gap-1"
                >
                  Все приложения
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {apps.map((app) => (
                  <Link
                    key={app.id}
                    href={`/p/${orgId}/apps/${app.id}`}
                    className="block bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="text-4xl mb-3">{app.icon}</div>
                      <VisibilityBadge visibility={app.visibility} />
                    </div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                      {app.name}
                    </h3>
                    {app.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                        {app.description}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Empty State */}
          {events.length === 0 && apps.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400 text-lg">
                Скоро здесь появятся события и приложения
              </p>
            </div>
          )}

          {/* Login Banner */}
          {(apps.length > 0 || events.length > 0) && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 text-center">
              <p className="text-blue-900 dark:text-blue-100 mb-4">
                Войдите, чтобы увидеть больше контента и зарегистрироваться на события
              </p>
              <Link
                href={`/p/${orgId}/auth`}
                className="inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                <LogIn className="w-5 h-5 mr-2" />
                Войти как участник
              </Link>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-700 mt-16 py-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Создано на платформе{' '}
            <a
              href="https://www.orbo.ru"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
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

