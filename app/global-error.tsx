"use client";

import { useEffect } from "react";
import { createClientLogger } from "@/lib/logger";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Логируем ошибку (Hawk отловит её автоматически на сервере)
    const logger = createClientLogger('GlobalError');
    logger.error({ 
      error: error.message,
      stack: error.stack,
      digest: error.digest
    }, 'Global error occurred');
  }, [error]);

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
          <h1 style={{ marginBottom: '16px' }}>Что-то пошло не так</h1>
          <p style={{ marginBottom: '24px', color: '#888' }}>
            Произошла непредвиденная ошибка. Мы уже работаем над её устранением.
          </p>
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
        </div>
      </body>
    </html>
  );
}
