'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  Loader2, 
  Store, 
  Star, 
  ExternalLink, 
  Check, 
  Bot,
  BookOpen,
  Shield,
  Zap
} from 'lucide-react';
import { createClientLogger } from '@/lib/logger';

interface CatalogAppDetails {
  id: string;
  name: string;
  slug: string;
  short_description: string;
  full_description: string | null;
  icon_url: string | null;
  banner_url: string | null;
  screenshots: string[];
  bot_username: string | null;
  miniapp_url: string | null;
  bot_deep_link_template: string | null;
  setup_instructions: string | null;
  features: string[];
  category: string;
  tags: string[];
  partner_name: string | null;
  partner_website: string | null;
  featured: boolean;
  created_at: string;
}

export default function CatalogAppDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params?.org as string;
  const appId = params?.appId as string;
  const clientLogger = createClientLogger('CatalogAppDetails', { orgId, appId });
  
  const [app, setApp] = useState<CatalogAppDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAppDetails();
    checkConnection();
  }, [appId]);

  const fetchAppDetails = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/apps/catalog/${appId}`);
      if (response.ok) {
        const data = await response.json();
        setApp(data.app);
      } else if (response.status === 404) {
        setError('Приложение не найдено');
      } else {
        setError('Ошибка загрузки');
      }
    } catch (err) {
      clientLogger.error({ error: err }, 'Error fetching app details');
      setError('Ошибка соединения');
    } finally {
      setIsLoading(false);
    }
  };

  const checkConnection = async () => {
    try {
      const response = await fetch(`/api/apps/org/${orgId}`);
      if (response.ok) {
        const data = await response.json();
        const connected = (data.apps || []).some(
          (a: any) => a.app_type === 'catalog' && a.source_id === appId
        );
        setIsConnected(connected);
      }
    } catch (err) {
      clientLogger.error({ error: err }, 'Error checking connection');
    }
  };

  const handleConnect = async () => {
    if (!app) return;
    
    setConnecting(true);
    try {
      const response = await fetch(`/api/apps/catalog/${app.id}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId })
      });
      
      if (response.ok) {
        router.push(`/p/${orgId}/apps?connected=${app.id}`);
      } else {
        const errData = await response.json();
        alert(errData.error || 'Не удалось подключить');
      }
    } catch (err) {
      clientLogger.error({ error: err }, 'Error connecting app');
      alert('Ошибка при подключении');
    } finally {
      setConnecting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
        </div>
      </div>
    );
  }

  if (error || !app) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Link
          href={`/p/${orgId}/apps/catalog`}
          className="inline-flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Назад к каталогу
        </Link>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            {error || 'Приложение не найдено'}
          </h2>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back link */}
      <Link
        href={`/p/${orgId}/apps/catalog`}
        className="inline-flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Назад к каталогу
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header Card */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* Banner */}
            {app.banner_url && (
              <div className="h-48 bg-gradient-to-br from-purple-500 to-pink-600">
                <img 
                  src={app.banner_url} 
                  alt="" 
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            
            {/* Featured badge */}
            {app.featured && !app.banner_url && (
              <div className="bg-gradient-to-r from-amber-400 to-orange-500 text-white text-sm font-medium px-4 py-2 flex items-center justify-center gap-2">
                <Star className="w-4 h-4" />
                Рекомендованное приложение
              </div>
            )}
            
            <div className="p-6">
              <div className="flex items-start gap-5">
                {app.icon_url ? (
                  <img 
                    src={app.icon_url} 
                    alt={app.name} 
                    className="w-20 h-20 rounded-2xl object-cover bg-gray-100 dark:bg-gray-700 shadow-md" 
                  />
                ) : (
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-md">
                    <Store className="w-10 h-10 text-white" />
                  </div>
                )}
                <div className="flex-1">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                    {app.name}
                  </h1>
                  {app.partner_name && (
                    <p className="text-gray-500 dark:text-gray-400 mb-3">
                      от {app.partner_name}
                      {app.partner_website && (
                        <a 
                          href={app.partner_website} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="ml-2 text-purple-600 hover:underline"
                        >
                          <ExternalLink className="w-3 h-3 inline" />
                        </a>
                      )}
                    </p>
                  )}
                  <p className="text-gray-600 dark:text-gray-400">
                    {app.short_description}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Description */}
          {app.full_description && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                О приложении
              </h2>
              <div className="prose dark:prose-invert max-w-none text-gray-600 dark:text-gray-400">
                {app.full_description.split('\n').map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </div>
          )}

          {/* Features */}
          {app.features && app.features.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Zap className="w-5 h-5 text-purple-500" />
                Возможности
              </h2>
              <ul className="space-y-3">
                {app.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-600 dark:text-gray-400">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Setup Instructions */}
          {app.setup_instructions && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-purple-500" />
                Как подключить
              </h2>
              <div className="prose dark:prose-invert max-w-none text-gray-600 dark:text-gray-400 text-sm">
                {app.setup_instructions.split('\n').map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </div>
          )}

          {/* Screenshots */}
          {app.screenshots && app.screenshots.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Скриншоты
              </h2>
              <div className="grid grid-cols-2 gap-4">
                {app.screenshots.map((src, i) => (
                  <img 
                    key={i}
                    src={src}
                    alt={`Screenshot ${i + 1}`}
                    className="rounded-lg border border-gray-200 dark:border-gray-700"
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Connect Card */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 sticky top-6">
            {isConnected ? (
              <>
                <div className="flex items-center gap-3 text-green-600 dark:text-green-400 mb-4">
                  <Check className="w-6 h-6" />
                  <span className="font-semibold">Подключено</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Это приложение уже подключено к вашей организации
                </p>
                <Link
                  href={`/p/${orgId}/apps`}
                  className="block w-full text-center px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Перейти к приложениям
                </Link>
              </>
            ) : (
              <>
                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="w-full inline-flex items-center justify-center px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 mb-4"
                >
                  {connecting ? (
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  ) : null}
                  Подключить приложение
                </button>
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                  Бесплатно • Можно отключить в любой момент
                </p>
              </>
            )}
            
            {/* Bot link */}
            {app.bot_username && (
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <a
                  href={`https://t.me/${app.bot_username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400"
                >
                  <Bot className="w-5 h-5" />
                  <span className="text-sm">@{app.bot_username}</span>
                  <ExternalLink className="w-4 h-4 ml-auto" />
                </a>
              </div>
            )}
            
            {/* MiniApp link */}
            {app.miniapp_url && (
              <div className="mt-4">
                <a
                  href={app.miniapp_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400"
                >
                  <Store className="w-5 h-5" />
                  <span className="text-sm">Открыть MiniApp</span>
                  <ExternalLink className="w-4 h-4 ml-auto" />
                </a>
              </div>
            )}
          </div>

          {/* Tags */}
          {app.tags && app.tags.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                Теги
              </h3>
              <div className="flex flex-wrap gap-2">
                {app.tags.map(tag => (
                  <span 
                    key={tag}
                    className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg text-sm"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Info */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
            <div className="flex gap-3">
              <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-blue-900 dark:text-blue-100 text-sm mb-1">
                  Безопасность
                </h4>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Приложения проходят проверку перед добавлением в каталог
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

