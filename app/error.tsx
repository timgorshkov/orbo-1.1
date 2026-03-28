"use client";

import { useEffect, useState } from "react";
import { createClientLogger } from "@/lib/logger";

// Определяем тип ошибки Server Action (после деплоя)
function isServerActionMismatchError(error: Error): boolean {
  return error.message.includes('Failed to find Server Action') ||
         error.message.includes('older or newer deployment')
}

// ChunkLoadError — старый JS chunk недоступен после деплоя
function isChunkLoadError(error: Error): boolean {
  return error.name === 'ChunkLoadError' ||
         error.message.includes('Loading chunk') ||
         error.message.includes('ChunkLoadError')
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [isReloading, setIsReloading] = useState(false);
  const isDeploymentMismatch = isServerActionMismatchError(error);
  const isChunkError = isChunkLoadError(error);
  const isDeployRelated = isDeploymentMismatch || isChunkError;

  useEffect(() => {
    const logger = createClientLogger('Error');

    if (isDeploymentMismatch) {
      logger.warn({
        error: error.message,
        digest: error.digest,
        type: 'deployment_mismatch'
      }, 'Server Action mismatch after deployment');
    } else if (isChunkError) {
      logger.warn({
        error: error.message,
        digest: error.digest,
        type: 'chunk_load_error'
      }, 'Chunk load error after deployment');
    } else {
      logger.error({ 
        error: error.message,
        stack: error.stack,
        digest: error.digest
      }, 'Page error occurred');
      
      // Persist to database via API for superadmin dashboard
      fetch('/api/log-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'error-boundary',
          message: error.message,
          stack: error.stack,
          digest: error.digest,
          url: window.location.href,
          userAgent: navigator.userAgent,
        }),
      }).catch(() => {/* silent */});
    }
  }, [error, isDeploymentMismatch, isChunkError]);

  const handleReload = () => {
    setIsReloading(true);
    window.location.reload();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-5">
      {isDeployRelated ? (
        <>
          <div className="text-5xl mb-4">🔄</div>
          <h2 className="text-xl font-semibold mb-2 text-gray-900">
            Доступна новая версия
          </h2>
          <p className="text-gray-600 mb-6 text-center max-w-md">
            Приложение было обновлено. Перезагрузите страницу для продолжения работы.
          </p>
          <button
            onClick={handleReload}
            disabled={isReloading}
            className="px-6 py-3 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-70 disabled:cursor-wait transition-colors"
          >
            {isReloading ? 'Загрузка...' : 'Обновить страницу'}
          </button>
        </>
      ) : (
        <>
          <h2 className="text-xl font-semibold mb-2 text-gray-900">
            Что-то пошло не так
          </h2>
          <p className="text-gray-600 mb-6 text-center max-w-md">
            Произошла ошибка при загрузке страницы.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => reset()}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Попробовать снова
            </button>
            <button
              onClick={handleReload}
              disabled={isReloading}
              className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-70 disabled:cursor-wait transition-colors"
            >
              {isReloading ? 'Загрузка...' : 'Обновить страницу'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

