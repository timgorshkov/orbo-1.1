'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { AppWindow, Plus, CheckCircle2, Loader2 } from 'lucide-react';
import { createClientLogger } from '@/lib/logger';

interface App {
  id: string;
  name: string;
  description: string;
  icon: string;
  logo_url: string | null;
  app_type: string;
  status: string;
  created_at: string;
}

export default function AppsPage() {
  const params = useParams();
  const orgId = params?.org as string;
  const searchParams = useSearchParams();
  const createdAppId = searchParams?.get('created');
  const clientLogger = createClientLogger('AppsPage', { orgId });
  const [showSuccess, setShowSuccess] = useState(false);
  const [apps, setApps] = useState<App[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (createdAppId) {
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [createdAppId]);

  useEffect(() => {
    if (orgId) {
      fetchApps();
      checkAdminStatus();
    }
  }, [orgId]);

  const checkAdminStatus = async () => {
    try {
      const authResponse = await fetch('/api/auth/status');
      if (authResponse.ok) {
        const authData = await authResponse.json();
        if (authData.authenticated && authData.user) {
          const membershipResponse = await fetch(`/api/memberships?org_id=${orgId}&user_id=${authData.user.id}`);
          if (membershipResponse.ok) {
            const membershipData = await membershipResponse.json();
            if (membershipData.memberships && membershipData.memberships.length > 0) {
              const membership = membershipData.memberships[0];
              setIsAdmin(membership.role === 'owner' || membership.role === 'admin');
            }
          }
        }
      }
    } catch (error) {
      clientLogger.error({
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        org_id: orgId
      }, 'Error checking admin status');
    }
  };

  const fetchApps = async () => {
    try {
      setIsLoading(true);
      clientLogger.debug({
        org_id: orgId
      }, 'Fetching apps for org');
      const response = await fetch(`/api/apps?orgId=${orgId}`);
      if (response.ok) {
        const data = await response.json();
        clientLogger.debug({
          app_count: data.apps?.length || 0,
          org_id: orgId
        }, 'Received apps');
        setApps(data.apps || []);
      } else {
        clientLogger.error({
          status: response.status,
          org_id: orgId
        }, 'Failed to fetch apps');
      }
    } catch (error) {
      clientLogger.error({
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        org_id: orgId
      }, 'Error fetching apps');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Success Message */}
      {showSuccess && (
        <div className="mb-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-start space-x-3 animate-fadeIn">
          <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div className="font-semibold text-green-900 dark:text-green-100">
              🎉 Приложение успешно создано!
            </div>
            <div className="text-sm text-green-700 dark:text-green-300 mt-1">
              Ваше приложение готово к использованию. Теперь вы можете добавлять элементы и настраивать его.
            </div>
          </div>
          <button
            onClick={() => setShowSuccess(false)}
            className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Приложения
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {isAdmin ? 'Создавайте и управляйте приложениями для вашего сообщества' : 'Полезные приложения сообщества'}
          </p>
        </div>
        
        {/* ✅ Create button only for admins, responsive */}
        {isAdmin && (
          <Link
            href="/create-app"
            title="Создать приложение"
            className="inline-flex items-center justify-center px-3 md:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            <Plus className="w-5 h-5 md:mr-2" />
            <span className="hidden md:inline">Создать приложение</span>
          </Link>
        )}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      )}

      {/* Apps Grid */}
      {!isLoading && apps.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {apps.map((app) => (
            <Link
              key={app.id}
              href={`/p/${orgId}/apps/${app.id}`}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all group"
            >
              <div className="flex items-start space-x-4">
                {app.logo_url ? (
                  <img src={app.logo_url} alt={app.name} className="w-16 h-16 rounded-lg object-contain flex-shrink-0" />
                ) : (
                  <div className="text-4xl flex-shrink-0">{app.icon}</div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate">
                    {app.name}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                    {app.description}
                  </p>
                  <div className="mt-3 flex items-center space-x-2">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200">
                      {app.app_type}
                    </span>
                    {app.status === 'active' && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200">
                        Активно
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && apps.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
        <div className="max-w-md mx-auto">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <AppWindow className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            У вас пока нет приложений
          </h2>
          
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Создайте своё первое приложение с помощью AI-конструктора — это займёт всего пару минут!
          </p>
          
          <Link
            href="/create-app"
            className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            <Plus className="w-5 h-5 mr-2" />
            Создать первое приложение
          </Link>
          
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
              <div className="text-2xl mb-2">📦</div>
              <h3 className="font-medium text-gray-900 dark:text-white text-sm mb-1">
                Доски объявлений
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Для продажи, покупки, обмена
              </p>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
              <div className="text-2xl mb-2">🎫</div>
              <h3 className="font-medium text-gray-900 dark:text-white text-sm mb-1">
                События
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Регистрация на мероприятия
              </p>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
              <div className="text-2xl mb-2">💼</div>
              <h3 className="font-medium text-gray-900 dark:text-white text-sm mb-1">
                Заявки
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Сбор запросов от участников
              </p>
            </div>
          </div>
        </div>
        </div>
      )}
    </div>
  );
}
