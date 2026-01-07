'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { AppWindow, Plus, CheckCircle2, Loader2, ExternalLink, Store, Unplug } from 'lucide-react';
import { createClientLogger } from '@/lib/logger';

interface App {
  id: string;
  name: string;
  description: string;
  icon_url: string | null;
  app_type: 'own' | 'catalog';
  source_id: string;
  miniapp_url: string | null;
  status: string;
  created_at: string;
}

export default function AppsPage() {
  const params = useParams();
  const orgId = params?.org as string;
  const searchParams = useSearchParams();
  const createdAppId = searchParams?.get('created');
  const connectedAppId = searchParams?.get('connected');
  const clientLogger = createClientLogger('AppsPage', { orgId });
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [apps, setApps] = useState<App[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  useEffect(() => {
    if (createdAppId) {
      setSuccessMessage('🎉 Приложение успешно создано!');
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), 5000);
      return () => clearTimeout(timer);
    }
    if (connectedAppId) {
      setSuccessMessage('✅ Приложение подключено!');
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [createdAppId, connectedAppId]);

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
      clientLogger.debug({ org_id: orgId }, 'Fetching apps for org');
      
      // Используем новый API для получения единого списка приложений
      const response = await fetch(`/api/apps/org/${orgId}`);
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

  const handleDisconnect = async (app: App) => {
    if (!confirm(`Отключить приложение «${app.name}»?`)) return;
    
    setDisconnecting(app.id);
    try {
      const response = await fetch(`/api/apps/catalog/${app.source_id}/connect`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId })
      });
      
      if (response.ok) {
        setApps(apps.filter(a => a.id !== app.id));
        setSuccessMessage('Приложение отключено');
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
      } else {
        alert('Не удалось отключить приложение');
      }
    } catch (error) {
      clientLogger.error({ error }, 'Error disconnecting app');
      alert('Ошибка при отключении');
    } finally {
      setDisconnecting(null);
    }
  };

  const getAppHref = (app: App): string => {
    if (app.app_type === 'catalog' && app.miniapp_url) {
      // Ensure external URL has protocol
      const url = app.miniapp_url;
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
      }
      return `https://${url}`;
    }
    return `/p/${orgId}/apps/${app.source_id}`;
  };

  const isExternalLink = (app: App): boolean => {
    return app.app_type === 'catalog' && !!app.miniapp_url;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Success Message */}
      {showSuccess && (
        <div className="mb-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-start space-x-3 animate-fadeIn">
          <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div className="font-semibold text-green-900 dark:text-green-100">
              {successMessage}
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
            {isAdmin ? 'Управляйте приложениями вашего сообщества' : 'Полезные приложения сообщества'}
          </p>
        </div>
        
        {/* Actions */}
        {isAdmin && (
          <div className="flex items-center gap-3">
            <Link
              href={`/p/${orgId}/apps/catalog`}
              title="Каталог приложений"
              className="inline-flex items-center justify-center px-3 md:px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium"
            >
              <Store className="w-5 h-5 md:mr-2" />
              <span className="hidden md:inline">Каталог</span>
            </Link>
            <Link
              href="/create-app"
              title="Создать приложение"
              className="inline-flex items-center justify-center px-3 md:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <Plus className="w-5 h-5 md:mr-2" />
              <span className="hidden md:inline">Создать</span>
            </Link>
          </div>
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
          {apps.map((app) => {
            const href = getAppHref(app);
            const external = isExternalLink(app);
            
            return (
              <div
                key={app.id}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all group relative"
              >
                {/* Disconnect button for catalog apps */}
                {isAdmin && app.app_type === 'catalog' && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      handleDisconnect(app);
                    }}
                    disabled={disconnecting === app.id}
                    className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                    title="Отключить приложение"
                  >
                    {disconnecting === app.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Unplug className="w-4 h-4" />
                    )}
                  </button>
                )}
                
                <Link
                  href={href}
                  target={external ? '_blank' : undefined}
                  rel={external ? 'noopener noreferrer' : undefined}
                >
                  <div className="flex items-start space-x-4">
                    {app.icon_url ? (
                      <img 
                        src={app.icon_url} 
                        alt={app.name} 
                        className="w-14 h-14 rounded-xl object-cover flex-shrink-0 bg-gray-100 dark:bg-gray-700" 
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                        <AppWindow className="w-7 h-7 text-white" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate flex items-center gap-1.5">
                        {app.name}
                        {external && (
                          <ExternalLink className="w-4 h-4 text-gray-400" />
                        )}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                        {app.description}
                      </p>
                      <div className="mt-3 flex items-center flex-wrap gap-2">
                        {app.app_type === 'catalog' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200">
                            <Store className="w-3 h-3 mr-1" />
                            Каталог
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200">
                            Своё
                          </span>
                        )}
                        {app.status === 'active' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200">
                            Активно
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              </div>
            );
          })}
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
              Подключите готовое приложение из каталога или создайте своё с помощью AI-конструктора
            </p>
            
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href={`/p/${orgId}/apps/catalog`}
                className="inline-flex items-center justify-center px-5 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
              >
                <Store className="w-5 h-5 mr-2" />
                Каталог приложений
              </Link>
              <Link
                href="/create-app"
                className="inline-flex items-center justify-center px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                <Plus className="w-5 h-5 mr-2" />
                Создать своё
              </Link>
            </div>
            
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <div className="text-2xl mb-2">🤝</div>
                <h3 className="font-medium text-gray-900 dark:text-white text-sm mb-1">
                  Мэтчинг
                </h3>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Связывание запросов участников
                </p>
              </div>
              
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <div className="text-2xl mb-2">📦</div>
                <h3 className="font-medium text-gray-900 dark:text-white text-sm mb-1">
                  Доски объявлений
                </h3>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Продажа, покупка, обмен
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
