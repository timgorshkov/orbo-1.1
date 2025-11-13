'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppWindow, Plus, LogIn, ArrowLeft } from 'lucide-react';
import VisibilityBadge from '@/components/apps/visibility-badge';

interface App {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  app_type: string;
  status: string;
  visibility: 'public' | 'members' | 'private';
}

interface Organization {
  id: string;
  name: string;
}

export default function PublicAppsPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.org as string;
  const [org, setOrg] = useState<Organization | null>(null);
  const [apps, setApps] = useState<App[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetchData();
  }, [orgId]);

  const fetchData = async () => {
    try {
      setIsLoading(true);

      // Check auth status
      const authResponse = await fetch('/api/auth/status');
      if (authResponse.ok) {
        const authData = await authResponse.json();
        setIsAuthenticated(authData.authenticated);

        // Check if admin
        if (authData.authenticated && authData.user) {
          const membershipResponse = await fetch(`/api/memberships?org_id=${orgId}&user_id=${authData.user.id}`);
          if (membershipResponse.ok) {
            const membershipData = await membershipResponse.json();
            const isOrgAdmin = membershipData.memberships && membershipData.memberships.length > 0;
            setIsAdmin(isOrgAdmin);

            // Redirect admins to internal page
            if (isOrgAdmin) {
              router.push(`/app/${orgId}/apps`);
              return;
            }
          }
        }
      }

      // Fetch organization
      const orgResponse = await fetch(`/api/organizations/${orgId}/public`);
      if (orgResponse.ok) {
        const orgData = await orgResponse.json();
        setOrg(orgData.organization);
      }

      // Fetch apps (RLS will filter by visibility automatically)
      const appsResponse = await fetch(`/api/apps?orgId=${orgId}`);
      if (appsResponse.ok) {
        const appsData = await appsResponse.json();
        // Filter only published apps
        setApps((appsData.apps || []).filter((a: App) => a.status === 'published'));
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!org) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Организация не найдена
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
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-4 py-6">
          <Link
            href={`/p/${orgId}`}
            className="inline-flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4 text-sm"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {org.name}
          </Link>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <AppWindow className="w-8 h-8 text-green-600" />
              Приложения
            </h1>
            {!isAuthenticated && (
              <Link
                href={`/p/${orgId}/auth`}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                <LogIn className="w-4 h-4 mr-2" />
                Войти
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {apps.length === 0 ? (
          // Empty State
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <AppWindow className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Пока нет доступных приложений
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {isAuthenticated 
                  ? 'Администраторы скоро добавят приложения для вашего сообщества'
                  : 'Войдите, чтобы увидеть приложения для участников'}
              </p>
              {!isAuthenticated && (
                <Link
                  href={`/p/${orgId}/auth`}
                  className="inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                >
                  <LogIn className="w-5 h-5 mr-2" />
                  Войти как участник
                </Link>
              )}
            </div>
          </div>
        ) : (
          // Apps Grid
          <>
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

            {/* Login Banner */}
            {!isAuthenticated && (
              <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 text-center">
                <p className="text-blue-900 dark:text-blue-100 mb-4">
                  Войдите, чтобы увидеть больше приложений и получить доступ к функциям
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
          </>
        )}
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

