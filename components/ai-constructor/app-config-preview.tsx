'use client';

import { useState } from 'react';
import { X, CheckCircle2, AlertCircle } from 'lucide-react';

interface AppConfigPreviewProps {
  config: any;
  onClose: () => void;
  onCreateApp: (orgId: string) => void;
  userOrganizations: Array<{ id: string; name: string }>;
}

export default function AppConfigPreview({
  config,
  onClose,
  onCreateApp,
  userOrganizations,
}: AppConfigPreviewProps) {
  const [selectedOrgId, setSelectedOrgId] = useState(
    userOrganizations.length > 0 ? userOrganizations[0].id : ''
  );
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!selectedOrgId) {
      alert('Пожалуйста, выберите организацию');
      return;
    }

    setIsCreating(true);
    await onCreateApp(selectedOrgId);
    // onCreateApp will handle navigation/success
  };

  const collection = config.collections?.[0];
  const fields = collection?.schema?.fields || [];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Предпросмотр приложения
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Проверьте настройки перед созданием
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* App Info */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-6">
            <div className="flex items-start space-x-4">
              <div className="text-4xl">{config.app?.icon || '📦'}</div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {config.app?.name || 'Без названия'}
                </h3>
                <p className="text-gray-600 dark:text-gray-300 mt-1">
                  {config.app?.description || 'Нет описания'}
                </p>
                <div className="mt-3 flex items-center space-x-4 text-sm">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200">
                    {config.app?.app_type || 'custom'}
                  </span>
                  {collection?.moderation_enabled && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200">
                      С модерацией
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Collection Info */}
          {collection && (
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
                Коллекция: {collection.display_name}
              </h4>
              
              {/* Fields */}
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Поля ({fields.length}):
                </div>
                <div className="space-y-2">
                  {fields.map((field: any, index: number) => (
                    <div
                      key={index}
                      className="flex items-center justify-between bg-white dark:bg-gray-800 rounded p-3"
                    >
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {field.label}
                          {field.required && (
                            <span className="text-red-500 ml-1">*</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {field.name} • {field.type}
                          {field.type === 'select' && ` (${field.options?.length || 0} опций)`}
                        </div>
                      </div>
                      {field.required ? (
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          опционально
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Categories (if select field) */}
              {fields.find((f: any) => f.name === 'category') && (
                <div className="mt-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Категории:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {fields
                      .find((f: any) => f.name === 'category')
                      ?.options?.map((opt: any, i: number) => (
                        <span
                          key={i}
                          className="px-3 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-sm"
                        >
                          {opt.label}
                        </span>
                      )) || null}
                  </div>
                </div>
              )}

              {/* Workflows */}
              <div className="mt-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Статусы публикаций:
                </div>
                <div className="flex flex-wrap gap-2">
                  {collection.workflows?.statuses?.map((status: string, i: number) => (
                    <span
                      key={i}
                      className={`px-3 py-1 rounded-full text-sm ${
                        status === collection.workflows.initial_status
                          ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 font-medium'
                          : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {status}
                      {status === collection.workflows.initial_status && ' (начальный)'}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Organization Selector */}
          {userOrganizations.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Организация:
              </label>
              <select
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {userOrganizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {userOrganizations.length === 0 && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium text-yellow-800 dark:text-yellow-200">
                  Нет организаций
                </div>
                <div className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                  Вы должны быть участником хотя бы одной организации, чтобы создать приложение.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700 p-6 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-6 py-3 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors font-medium"
          >
            Вернуться к редактированию
          </button>
          <button
            onClick={handleCreate}
            disabled={isCreating || userOrganizations.length === 0}
            className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center space-x-2"
          >
            {isCreating ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Создаём...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                <span>Создать приложение</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

