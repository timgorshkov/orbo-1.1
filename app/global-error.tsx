"use client";

import { useEffect, useState } from "react";
import { createClientLogger } from "@/lib/logger";

// Определяем тип ошибки Server Action (после деплоя)
function isServerActionMismatchError(error: Error): boolean {
  return error.message.includes('Failed to find Server Action') ||
         error.message.includes('older or newer deployment')
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [isReloading, setIsReloading] = useState(false);
  const isDeploymentMismatch = isServerActionMismatchError(error);

  useEffect(() => {
    // Логируем ошибку
    const logger = createClientLogger('GlobalError');
    
    if (isDeploymentMismatch) {
      // Для ошибок деплоя логируем как warn (не критично)
      logger.warn({ 
        error: error.message,
        digest: error.digest,
        type: 'deployment_mismatch'
      }, 'Server Action mismatch after deployment');
    } else {
      logger.error({ 
        error: error.message,
        stack: error.stack,
        digest: error.digest
      }, 'Global error occurred');
    }
  }, [error, isDeploymentMismatch]);

  const handleReload = () => {
    setIsReloading(true);
    // Hard reload для получения нового кода
    window.location.reload();
  };

  return (
    <html>
      <body>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '20px',
          fontFamily: 'system-ui, sans-serif',
          backgroundColor: '#0a0a0a',
          color: '#ededed'
        }}>
          {isDeploymentMismatch ? (
            <>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔄</div>
              <h1 style={{ marginBottom: '16px' }}>Доступна новая версия</h1>
              <p style={{ marginBottom: '24px', color: '#888', textAlign: 'center' }}>
                Приложение было обновлено. Перезагрузите страницу для продолжения работы.
              </p>
              <button
                onClick={handleReload}
                disabled={isReloading}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: isReloading ? 'wait' : 'pointer',
                  fontSize: '16px',
                  opacity: isReloading ? 0.7 : 1
                }}
              >
                {isReloading ? 'Загрузка...' : 'Обновить страницу'}
              </button>
            </>
          ) : (
            <>
              <h1 style={{ marginBottom: '16px' }}>Что-то пошло не так</h1>
              <p style={{ marginBottom: '24px', color: '#888' }}>
                Произошла непредвиденная ошибка. Мы уже работаем над её устранением.
              </p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => reset()}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '16px'
                  }}
                >
                  Попробовать снова
                </button>
                <button
                  onClick={handleReload}
                  disabled={isReloading}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#374151',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: isReloading ? 'wait' : 'pointer',
                    fontSize: '16px',
                    opacity: isReloading ? 0.7 : 1
                  }}
                >
                  {isReloading ? 'Загрузка...' : 'Обновить страницу'}
                </button>
              </div>
            </>
          )}
        </div>
      </body>
    </html>
  );
}
