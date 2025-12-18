'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Settings, 
  Trash2, 
  Plus,
  Loader2,
  AppWindow,
  Users,
  BarChart3,
  FileText,
  ExternalLink,
  Share2,
  Copy,
  Check,
  AlertCircle
} from 'lucide-react';
import { createClientLogger } from '@/lib/logger';

interface App {
  id: string;
  org_id: string;
  name: string;
  description: string;
  icon: string;
  app_type: string;
  status: string;
  config: any;
  created_at: string;
}

interface Collection {
  id: string;
  app_id: string;
  name: string;
  display_name: string;
  icon: string;
  schema: any;
  permissions: any;
  workflows: any;
  views: string[];
  moderation_enabled: boolean;
  created_at: string;
}

export default function AppDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.org as string;
  const appId = params.appId as string;
  const clientLogger = createClientLogger('AppDetailPage', { orgId, appId });

  const [app, setApp] = useState<App | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Redirect to public page (with admin toolbar if authenticated)
    router.replace(`/p/${orgId}/apps/${appId}`);
  }, [appId, orgId, router]);

  const fetchAppDetails = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch app details
      const appResponse = await fetch(`/api/apps/${appId}`);
      if (!appResponse.ok) {
        throw new Error('Failed to fetch app');
      }
      const appData = await appResponse.json();
      setApp(appData.app);

      // Fetch collections
      const collectionsResponse = await fetch(`/api/apps/${appId}/collections`);
      if (collectionsResponse.ok) {
        const collectionsData = await collectionsResponse.json();
        setCollections(collectionsData.collections || []);
      }
    } catch (err: any) {
      clientLogger.error({ error: err.message }, 'Error fetching app details');
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Вы уверены, что хотите удалить приложение "${app?.name}"?\n\nВсе данные (коллекции, элементы, комментарии) будут безвозвратно удалены!`)) {
      return;
    }

    try {
      const response = await fetch(`/api/apps/${appId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete app');
      }

      router.push(`/app/${orgId}/apps`);
    } catch (err: any) {
      clientLogger.error({ error: err.message }, 'Error deleting app');
      alert(err.message || 'Не удалось удалить приложение. Попробуйте ещё раз.');
    }
  };

  const getPublicUrl = () => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/p/${orgId}/apps/${appId}`;
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(getPublicUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err: any) {
      clientLogger.error({ error: err?.message }, 'Failed to copy link');
      alert('Не удалось скопировать ссылку');
    }
  };

  const handleOpenPublic = () => {
    window.open(getPublicUrl(), '_blank');
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  if (error || !app) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
          <p className="text-red-800 dark:text-red-200">
            {error || 'Приложение не найдено'}
          </p>
          <Link
            href={`/app/${orgId}/apps`}
            className="inline-flex items-center mt-4 text-blue-600 hover:text-blue-700"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Вернуться к списку приложений
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back Link */}
      <Link
        href={`/app/${orgId}/apps`}
        className="inline-flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        К списку приложений
      </Link>

      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-4">
            <div className="text-5xl">{app.icon}</div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                {app.name}
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {app.description}
              </p>
              <div className="flex items-center space-x-2">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200">
                  {app.app_type}
                </span>
                {app.status === 'active' && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200">
                    Активно
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleOpenPublic}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Открыть публичную страницу
            </button>
            <button
              onClick={handleCopyLink}
              className="inline-flex items-center px-4 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors font-medium"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Скопировано!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-2" />
                  Скопировать ссылку
                </>
              )}
            </button>
            <Link
              href={`/app/${orgId}/apps/${appId}/edit`}
              className="inline-flex items-center px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              <Settings className="w-4 h-4 mr-2" />
              Настроить
            </Link>
            <Link
              href={`/app/${orgId}/apps/${appId}/moderation`}
              className="inline-flex items-center px-4 py-2 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-lg hover:bg-yellow-200 dark:hover:bg-yellow-900/50 transition-colors"
            >
              <AlertCircle className="w-4 h-4 mr-2" />
              Модерация
            </Link>
            <button
              onClick={handleDelete}
              className="inline-flex items-center px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Удалить
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Коллекций</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {collections.length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Элементов</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">0</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Просмотров</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">0</p>
            </div>
          </div>
        </div>
      </div>

      {/* Collections Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Коллекции
          </h2>
          <button
            onClick={() => alert('Создание коллекций будет доступно в следующей версии')}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Добавить коллекцию
          </button>
        </div>

        {collections.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-600 dark:text-gray-400">
              У этого приложения пока нет коллекций
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {collections.map((collection) => (
              <div
                key={collection.id}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    <div className="text-2xl">{collection.icon}</div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {collection.display_name}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {collection.schema?.fields?.length || 0} полей
                      </p>
                      <div className="flex items-center space-x-2 mt-2">
                        {collection.views.map((view) => (
                          <span
                            key={view}
                            className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
                          >
                            {view}
                          </span>
                        ))}
                        {collection.moderation_enabled && (
                          <span className="text-xs px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400 rounded">
                            С модерацией
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => alert('Просмотр элементов будет доступен в следующей версии')}
                    className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    Посмотреть →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

