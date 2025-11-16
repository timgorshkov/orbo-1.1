'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Check, X, AlertCircle, Inbox } from 'lucide-react';

interface App {
  id: string;
  name: string;
  icon: string;
  logo_url: string | null;
}

interface Collection {
  id: string;
  schema: any;
}

interface AppItem {
  id: string;
  data: Record<string, any>;
  status: string;
  created_at: string;
  created_by_participant_id: string | null;
}

export default function ModerationPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.org as string;
  const appId = params.appId as string;

  const [app, setApp] = useState<App | null>(null);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [pendingItems, setPendingItems] = useState<AppItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingItemId, setProcessingItemId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [appId]);

  const fetchData = async () => {
    try {
      setIsLoading(true);

      // Fetch app
      const appResponse = await fetch(`/api/apps/${appId}`);
      if (!appResponse.ok) throw new Error('App not found');
      const appData = await appResponse.json();
      setApp(appData.app);

      // Fetch collection
      const collectionResponse = await fetch(`/api/apps/${appId}/collections`);
      if (!collectionResponse.ok) throw new Error('Failed to fetch collection');
      const collectionData = await collectionResponse.json();
      if (collectionData.collections && collectionData.collections.length > 0) {
        setCollection(collectionData.collections[0]);
      }

      // Fetch pending items
      const itemsResponse = await fetch(`/api/apps/${appId}/items?status=pending&limit=100`);
      if (!itemsResponse.ok) throw new Error('Failed to fetch items');
      const itemsData = await itemsResponse.json();
      setPendingItems(itemsData.items || []);
    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleModerate = async (itemId: string, action: 'approve' | 'reject') => {
    try {
      setProcessingItemId(itemId);

      const response = await fetch(`/api/apps/${appId}/items/${itemId}/moderate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          note: action === 'reject' ? 'Не соответствует правилам' : undefined,
        }),
      });

      if (!response.ok) throw new Error('Failed to moderate item');

      // Remove from pending list
      setPendingItems(prev => prev.filter(item => item.id !== itemId));
    } catch (err: any) {
      console.error('Error moderating item:', err);
      alert('Не удалось выполнить действие');
    } finally {
      setProcessingItemId(null);
    }
  };

  const renderFieldValue = (fieldName: string, value: any, field: any) => {
    if (!value) return <span className="text-gray-400">-</span>;

    switch (field?.type) {
      case 'image':
      case 'images':
        const images = Array.isArray(value) ? value : [value];
        return (
          <div className="flex gap-2">
            {images.slice(0, 3).map((img, idx) => (
              <img
                key={idx}
                src={img}
                alt={`Фото ${idx + 1}`}
                className="w-16 h-16 object-cover rounded"
              />
            ))}
            {images.length > 3 && (
              <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center text-sm text-gray-600 dark:text-gray-400">
                +{images.length - 3}
              </div>
            )}
          </div>
        );

      case 'number':
        return (
          <span className="font-semibold text-blue-600 dark:text-blue-400">
            {new Intl.NumberFormat('ru-RU').format(value)} ₽
          </span>
        );

      case 'select':
        const option = field.options?.find((opt: any) => opt.value === value);
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200">
            {option?.label || value}
          </span>
        );

      case 'text':
        return (
          <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
            {value}
          </p>
        );

      default:
        return <span className="text-sm text-gray-900 dark:text-white">{value}</span>;
    }
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

  if (error || !app || !collection) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <p className="text-red-800 dark:text-red-200">
            {error || 'Приложение не найдено'}
          </p>
          <Link
            href={`/p/${orgId}/apps/${appId}`}
            className="inline-flex items-center mt-4 text-blue-600 hover:text-blue-700"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Назад к приложению
          </Link>
        </div>
      </div>
    );
  }

  // Get title field
  const titleField = collection.schema.fields.find((f: any) => f.name === 'title' || f.type === 'string');

  return (
    <div className="container mx-auto px-4 py-8">
      <Link
        href={`/p/${orgId}/apps/${appId}`}
        className="inline-flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Назад к приложению
      </Link>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-6 p-6">
        <div className="flex items-center space-x-4">
          {app.logo_url ? (
            <img src={app.logo_url} alt={app.name} className="w-16 h-16 rounded-lg object-contain" />
          ) : (
            <div className="text-4xl">{app.icon}</div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Модерация: {app.name}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Объявлений на проверке: {pendingItems.length}
            </p>
          </div>
        </div>
      </div>

      {pendingItems.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
          <Inbox className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Нет объявлений на модерации
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Все объявления проверены. Новые появятся здесь автоматически.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendingItems.map((item) => {
            const title = titleField ? item.data[titleField.name] : 'Без названия';
            const isProcessing = processingItemId === item.id;

            return (
              <div
                key={item.id}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6"
              >
                <div className="flex items-start justify-between gap-6">
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                      {title}
                    </h3>

                    <div className="space-y-3">
                      {collection.schema.fields
                        .filter((f: any) => f.name !== titleField?.name)
                        .slice(0, 4)
                        .map((field: any) => (
                          <div key={field.name} className="flex items-start">
                            <span className="text-sm text-gray-600 dark:text-gray-400 w-32 flex-shrink-0">
                              {field.label}:
                            </span>
                            <div className="flex-1">
                              {renderFieldValue(field.name, item.data[field.name], field)}
                            </div>
                          </div>
                        ))}
                    </div>

                    <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                      Создано: {new Date(item.created_at).toLocaleString('ru-RU')}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => handleModerate(item.id, 'approve')}
                      disabled={isProcessing}
                      title="Одобрить"
                      className="inline-flex items-center justify-center px-3 md:px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {isProcessing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Check className="w-4 h-4 md:mr-2" />
                          <span className="hidden md:inline">Одобрить</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleModerate(item.id, 'reject')}
                      disabled={isProcessing}
                      title="Отклонить"
                      className="inline-flex items-center justify-center px-3 md:px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {isProcessing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <X className="w-4 h-4 md:mr-2" />
                          <span className="hidden md:inline">Отклонить</span>
                        </>
                      )}
                    </button>
                    <Link
                      href={`/p/${orgId}/apps/${appId}/items/${item.id}`}
                      target="_blank"
                      title="Подробнее"
                      className="inline-flex items-center justify-center px-3 md:px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm whitespace-nowrap"
                    >
                      <AlertCircle className="w-4 h-4 md:mr-1" />
                      <span className="hidden md:inline">Подробнее</span>
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

