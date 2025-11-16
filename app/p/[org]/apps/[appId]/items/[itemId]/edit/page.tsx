'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import DynamicForm from '@/components/apps/dynamic-form';

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

interface AppItem {
  id: string;
  data: Record<string, any>;
  status: string;
  created_at: string;
  creator_id: string | null;
}

export default function EditItemPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.org as string;
  const appId = params.appId as string;
  const itemId = params.itemId as string;

  const [app, setApp] = useState<App | null>(null);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [item, setItem] = useState<AppItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    fetchData();
  }, [appId, itemId]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Check authentication
      const authResponse = await fetch('/api/auth/status');
      const authData = await authResponse.json();
      setIsAuthenticated(authData.authenticated);

      if (!authData.authenticated) {
        router.push(`/signin?redirect=/p/${orgId}/apps/${appId}/items/${itemId}/edit`);
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
        setCollection(collectionData.collections[0]);
      }

      // Fetch item
      const itemResponse = await fetch(`/api/apps/${appId}/items/${itemId}`);
      if (!itemResponse.ok) {
        throw new Error('Item not found');
      }
      const itemData = await itemResponse.json();
      setItem(itemData.item);
    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (data: Record<string, any>) => {
    try {
      const response = await fetch(`/api/apps/${appId}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update item');
      }

      // Redirect back to item detail
      router.push(`/p/${orgId}/apps/${appId}/items/${itemId}`);
    } catch (error: any) {
      console.error('Error updating item:', error);
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

  if (error || !app || !collection || !item) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {error || 'Объявление не найдено'}
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
            href={`/p/${orgId}/apps/${appId}/items/${itemId}`}
            className="inline-flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4 text-sm"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Назад к объявлению
          </Link>

          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center text-2xl">
              {app.icon}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Редактировать
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {app.name} • {collection.display_name}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <DynamicForm
          schema={collection.schema}
          onSubmit={handleSubmit}
          onCancel={() => router.back()}
          initialData={item.data}
          submitLabel="Сохранить изменения"
        />
      </main>
    </div>
  );
}

