'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';

export default function TelegramAppHome() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'redirecting' | 'no-event' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    // Wait a bit for Telegram WebApp to initialize
    const timer = setTimeout(() => {
      handleRedirect();
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  const handleRedirect = () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tg = (window as any).Telegram?.WebApp;
      
      if (!tg) {
        // Not in Telegram - check URL params
        const urlParams = new URLSearchParams(window.location.search);
        const startParam = urlParams.get('tgWebAppStartParam') || urlParams.get('startapp');
        
        if (startParam) {
          processStartParam(startParam);
        } else {
          setStatus('no-event');
        }
        return;
      }

      // Initialize Telegram WebApp
      tg.ready();
      tg.expand();

      const startParam = tg.initDataUnsafe?.start_param;
      
      if (startParam) {
        processStartParam(startParam);
      } else {
        setStatus('no-event');
      }
    } catch (error) {
      console.error('Error handling redirect:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error');
      setStatus('error');
    }
  };

  const processStartParam = (startParam: string) => {
    // Parse start_param: e-{event_id}
    if (startParam.startsWith('e-')) {
      const eventId = startParam.substring(2);
      if (eventId && eventId.length > 0) {
        setStatus('redirecting');
        router.replace(`/tg-app/events/${eventId}`);
        return;
      }
    }
    
    // Unknown format
    setErrorMessage(`Неизвестный формат параметра: ${startParam}`);
    setStatus('error');
  };

  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="beforeInteractive"
      />
      
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          {status === 'loading' && (
            <>
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
              <p className="text-gray-600">Загрузка...</p>
            </>
          )}

          {status === 'redirecting' && (
            <>
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4" />
              <p className="text-gray-600">Переход к событию...</p>
            </>
          )}

          {status === 'no-event' && (
            <div className="space-y-4">
              <div className="text-6xl">📅</div>
              <h1 className="text-xl font-bold text-gray-900">Orbo Events</h1>
              <p className="text-gray-600">
                Используйте ссылку на конкретное событие для регистрации
              </p>
              <p className="text-sm text-gray-400">
                Формат: t.me/orbo_event_bot?startapp=e-EVENT_ID
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <div className="text-6xl">❌</div>
              <h1 className="text-xl font-bold text-red-600">Ошибка</h1>
              <p className="text-gray-600">{errorMessage}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

