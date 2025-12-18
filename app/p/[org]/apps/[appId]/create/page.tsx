'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import DynamicForm from '@/components/apps/dynamic-form';
import { createClientLogger } from '@/lib/logger';

interface App {
  id: string;
  name: string;
  description: string;
  icon: string;
  org_id: string;
}

interface Collection {
  id: string;
  name: string;
  display_name: string;
  schema: any;
  moderation_enabled: boolean;
}

export default function CreateItemPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.org as string;
  const appId = params.appId as string;
  const clientLogger = createClientLogger('CreateItemPage', { orgId, appId });

  const [app, setApp] = useState<App | null>(null);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    fetchAppData();
  }, [appId]);

  const fetchAppData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Check authentication
      const authResponse = await fetch('/api/auth/status');
      const authData = await authResponse.json();
      setIsAuthenticated(authData.authenticated);

      if (!authData.authenticated) {
        // Redirect to signin
        router.push(`/signin?redirect=/p/${orgId}/apps/${appId}/create`);
        return;
      }

      // Fetch app details
      const appResponse = await fetch(`/api/apps/${appId}`);
      if (!appResponse.ok) {
        throw new Error('App not found');
      }
      const appData = await appResponse.json();
      setApp(appData.app);

      // Fetch collection
      const collectionResponse = await fetch(`/api/apps/${appId}/collections`);
      if (!collectionResponse.ok) {
        throw new Error('Failed to fetch collection');
      }
      const collectionData = await collectionResponse.json();
      if (collectionData.collections && collectionData.collections.length > 0) {
        setCollection(collectionData.collections[0]); // First collection
      }
    } catch (err: any) {
      clientLogger.error({
        error: err.message || String(err),
        stack: err.stack,
        org_id: orgId,
        app_id: appId
      }, 'Error fetching app data');
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (data: Record<string, any>) => {
    try {
      const response = await fetch(`/api/apps/${appId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collectionId: collection?.id,
          data,
          status: collection?.moderation_enabled ? 'pending' : 'published',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create item');
      }

      const result = await response.json();

      // Redirect to item detail or feed
      if (collection?.moderation_enabled) {
        // Redirect to feed with success message
        router.push(`/p/${orgId}/apps/${appId}?success=moderation`);
      } else {
        // Redirect to created item
        router.push(`/p/${orgId}/apps/${appId}/items/${result.item.id}`);
      }
    } catch (error: any) {
      clientLogger.error({
        error: error.message || String(error),
        stack: error.stack,
        org_id: orgId,
        app_id: appId,
        collection_id: collection?.id
      }, 'Error creating item');
      throw error;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error || !app || !collection) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {error || 'Приложение не найдено'}
          </h1>
          <Link
            href={`/p/${orgId}/apps/${appId}`}
            className="inline-flex items-center text-blue-600 hover:text-blue-700 mt-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Вернуться к списку
          </Link>
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
            href={`/p/${orgId}/apps/${appId}`}
            className="inline-flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4 text-sm"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Назад к {app.name}
          </Link>

          <div className="flex items-start space-x-4">
            <div className="text-4xl">{app.icon}</div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                Добавить {collection.display_name}
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                {collection.moderation_enabled && (
                  <span className="inline-flex items-center text-sm">
                    ⏳ С модерацией — будет опубликовано после проверки
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <DynamicForm
              schema={collection.schema}
              onSubmit={handleSubmit}
              onCancel={() => router.back()}
              submitLabel={collection.moderation_enabled ? 'Отправить на модерацию' : 'Опубликовать'}
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-700 mt-12 py-6">
        <div className="container mx-auto px-4 text-center text-sm text-gray-600 dark:text-gray-400">
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
        </div>
      </footer>
    </div>
  );
}

