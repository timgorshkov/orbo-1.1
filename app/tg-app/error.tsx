"use client";

import { useEffect, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

export default function TelegramAppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [isReloading, setIsReloading] = useState(false);

  useEffect(() => {
    // Log error to console for debugging
    console.error('TelegramApp error:', error);
  }, [error]);

  const handleRetry = () => {
    setIsReloading(true);
    // Small delay to show loading state
    setTimeout(() => {
      reset();
      setIsReloading(false);
    }, 100);
  };

  const handleReload = () => {
    setIsReloading(true);
    // For Telegram WebApp, try to reload the current URL
    const currentUrl = window.location.href;
    window.location.href = currentUrl;
  };

  const handleClose = () => {
    // Try to close Telegram WebApp
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tg = (window as any).Telegram?.WebApp;
      if (tg?.close) {
        tg.close();
      }
    } catch (e) {
      // Fallback: just reload
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-white">
      <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
      <h1 className="text-xl font-semibold text-gray-900 mb-2">Что-то пошло не так</h1>
      <p className="text-gray-500 text-center mb-6 max-w-xs">
        Произошла ошибка. Попробуйте обновить страницу или закрыть и открыть заново.
      </p>
      
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={handleRetry}
          disabled={isReloading}
          className="w-full py-3 px-4 bg-blue-500 text-white rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isReloading ? (
            <RefreshCw className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <RefreshCw className="w-5 h-5" />
              Попробовать снова
            </>
          )}
        </button>
        
        <button
          onClick={handleReload}
          disabled={isReloading}
          className="w-full py-3 px-4 bg-gray-100 text-gray-700 rounded-xl font-medium disabled:opacity-50"
        >
          Обновить страницу
        </button>
        
        <button
          onClick={handleClose}
          className="w-full py-3 text-gray-400 text-sm"
        >
          Закрыть
        </button>
      </div>
    </div>
  );
}
