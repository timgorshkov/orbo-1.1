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
  const [primaryColor, setPrimaryColor] = useState('#3B82F6');
  const [secondaryColor, setSecondaryColor] = useState('#10B981');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

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
      setPrimaryColor(data.app.primary_color || '#3B82F6');
      setSecondaryColor(data.app.secondary_color || '#10B981');
      setLogoPreview(data.app.logo_url);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccessMessage(null);

      let logoUrl = app?.logo_url;

      // Upload logo if changed
      if (logoFile) {
        const formData = new FormData();
        formData.append('file', logoFile);
        formData.append('appId', appId);

        const uploadResponse = await fetch('/api/apps/upload-logo', {
          method: 'POST',
          body: formData,
        });

        if (!uploadResponse.ok) {
          throw new Error('Failed to upload logo');
        }

        const uploadData = await uploadResponse.json();
        logoUrl = uploadData.url;
      }

      // Update app
      const response = await fetch(`/api/apps/${appId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          primary_color: primaryColor,
          secondary_color: secondaryColor,
          logo_url: logoUrl,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update app');
      }

      setSuccessMessage('Изменения сохранены!');
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
              <Palette className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Визуальная кастомизация
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
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Settings Panel */}
            <div className="lg:col-span-2 space-y-6">
              {/* Colors Section */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Palette className="w-5 h-5" />
                  Цветовая схема
                </h2>

                <div className="space-y-4">
                  {/* Primary Color */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Основной цвет
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="w-16 h-16 rounded-lg border-2 border-gray-300 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="#3B82F6"
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Используется для кнопок, ссылок и акцентов
                    </p>
                  </div>

                  {/* Secondary Color */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Дополнительный цвет
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="w-16 h-16 rounded-lg border-2 border-gray-300 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="#10B981"
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Используется для второстепенных элементов
                    </p>
                  </div>
                </div>
              </div>

              {/* Logo Section */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <ImageIcon className="w-5 h-5" />
                  Логотип приложения
                </h2>

                <div className="space-y-4">
                  {logoPreview && (
                    <div className="flex items-center justify-center p-6 bg-gray-100 dark:bg-gray-700 rounded-lg">
                      <img
                        src={logoPreview}
                        alt="Logo preview"
                        className="max-h-32 max-w-full object-contain"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block">
                      <span className="sr-only">Выбрать логотип</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoChange}
                        className="block w-full text-sm text-gray-500
                          file:mr-4 file:py-2 file:px-4
                          file:rounded-lg file:border-0
                          file:text-sm file:font-semibold
                          file:bg-blue-50 file:text-blue-700
                          hover:file:bg-blue-100
                          cursor-pointer"
                      />
                    </label>
                    <p className="text-xs text-gray-500 mt-2">
                      Рекомендуем PNG или SVG, размер до 2MB
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Preview Panel */}
            <div className="lg:col-span-1">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 sticky top-24">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Предпросмотр
                </h2>

                {/* Preview Content */}
                <div className="space-y-4">
                  {/* Logo + Name */}
                  <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    {logoPreview ? (
                      <img src={logoPreview} alt="Logo" className="w-12 h-12 rounded-lg object-contain" />
                    ) : (
                      <div className="w-12 h-12 text-3xl">{app?.icon}</div>
                    )}
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-white">
                        {app?.name}
                      </div>
                      <div className="text-xs text-gray-500">Приложение</div>
                    </div>
                  </div>

                  {/* Button Preview */}
                  <div>
                    <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                      Кнопки:
                    </div>
                    <button
                      style={{ backgroundColor: primaryColor }}
                      className="w-full px-4 py-2 text-white rounded-lg font-medium shadow-sm"
                    >
                      Основная кнопка
                    </button>
                  </div>

                  <div>
                    <button
                      style={{ backgroundColor: secondaryColor }}
                      className="w-full px-4 py-2 text-white rounded-lg font-medium shadow-sm"
                    >
                      Дополнительная кнопка
                    </button>
                  </div>

                  {/* Link Preview */}
                  <div>
                    <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                      Ссылки:
                    </div>
                    <a
                      href="#"
                      style={{ color: primaryColor }}
                      className="inline-block font-medium underline"
                    >
                      Пример ссылки
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

