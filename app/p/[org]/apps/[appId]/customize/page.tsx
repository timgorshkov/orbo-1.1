'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Loader2, AlertCircle, Palette, ImageIcon } from 'lucide-react';

interface App {
  id: string;
  name: string;
  icon: string;
  primary_color: string;
  secondary_color: string;
  logo_url: string | null;
  custom_css: string | null;
}

export default function AppCustomizePage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.org as string;
  const appId = params.appId as string;

  const [app, setApp] = useState<App | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form state
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);

  useEffect(() => {
    fetchApp();
  }, [appId]);

  const fetchApp = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/apps/${appId}`);
      if (!response.ok) {
        throw new Error('App not found');
      }
      const data = await response.json();
      setApp(data.app);
      setIconPreview(data.app.logo_url);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleIconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIconFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setIconPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccessMessage(null);

      let iconUrl = app?.logo_url;

      // Upload icon if changed
      if (iconFile) {
        const formData = new FormData();
        formData.append('file', iconFile);
        formData.append('appId', appId);

        const uploadResponse = await fetch('/api/apps/upload-logo', {
          method: 'POST',
          body: formData,
        });

        if (!uploadResponse.ok) {
          throw new Error('Failed to upload icon');
        }

        const uploadData = await uploadResponse.json();
        iconUrl = uploadData.url;
      }

      // Update app
      const response = await fetch(`/api/apps/${appId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          logo_url: iconUrl,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update app');
      }

      setSuccessMessage('Иконка сохранена!');
      setTimeout(() => setSuccessMessage(null), 3000);
      await fetchApp();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error && !app) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Ошибка загрузки
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
          <Link
            href={`/p/${orgId}/apps`}
            className="inline-flex items-center text-blue-600 hover:text-blue-700"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Вернуться к списку приложений
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <Link
            href={`/p/${orgId}/apps/${appId}`}
            className="inline-flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-3 text-sm"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Назад к приложению
          </Link>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ImageIcon className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Иконка приложения
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {app?.name}
                </p>
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Сохранение...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5 mr-2" />
                  Сохранить
                </>
              )}
            </button>
          </div>

          {/* Success/Error Messages */}
          {successMessage && (
            <div className="mt-4 p-3 bg-green-100 border border-green-300 text-green-800 rounded-lg text-sm">
              {successMessage}
            </div>
          )}
          {error && app && (
            <div className="mt-4 p-3 bg-red-100 border border-red-300 text-red-800 rounded-lg text-sm">
              {error}
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-8">
            <div className="flex items-start gap-6">
              {/* Icon Preview */}
              <div className="flex-shrink-0">
                <div className="w-32 h-32 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600">
                  {iconPreview ? (
                    <img
                      src={iconPreview}
                      alt="App icon"
                      className="w-28 h-28 rounded-xl object-contain"
                    />
                  ) : (
                    <div className="text-6xl">{app?.icon || '📱'}</div>
                  )}
                </div>
              </div>

              {/* Upload Section */}
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Иконка приложения
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Загрузите изображение, которое будет использоваться вместо эмодзи "{app?.icon}". 
                  Иконка отображается в списке приложений и на публичной странице.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block">
                      <span className="sr-only">Выбрать иконку</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleIconChange}
                        className="block w-full text-sm text-gray-500
                          file:mr-4 file:py-2 file:px-4
                          file:rounded-lg file:border-0
                          file:text-sm file:font-semibold
                          file:bg-blue-50 file:text-blue-700
                          hover:file:bg-blue-100
                          dark:file:bg-blue-900/30 dark:file:text-blue-400
                          cursor-pointer"
                      />
                    </label>
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-gray-500">
                        • Рекомендуем квадратное изображение (например, 512x512px)
                      </p>
                      <p className="text-xs text-gray-500">
                        • Форматы: PNG, SVG, JPEG, WebP
                      </p>
                      <p className="text-xs text-gray-500">
                        • Максимальный размер: 2MB
                      </p>
                    </div>
                  </div>

                  {iconPreview && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Иконка загружена. Нажмите "Сохранить" для применения.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Info Section */}
          <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
              💡 Где отображается иконка?
            </h3>
            <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
              <li>• В списке приложений вашего сообщества</li>
              <li>• На публичной странице приложения (вверху)</li>
              <li>• В карточках объявлений/записей</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}

