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
      
      // Try to get start_param from Telegram WebApp first
      let startParam: string | null = null;
      
      if (tg) {
        // Initialize Telegram WebApp
        tg.ready();
        tg.expand();
        startParam = tg.initDataUnsafe?.start_param || null;
        
        // Store initData and user for use across navigation
        if (tg.initData && tg.initData.length > 0) {
          try {
            sessionStorage.setItem('tg_init_data', tg.initData);
          } catch (e) {
            // Ignore storage errors
          }
        }
        if (tg.initDataUnsafe?.user) {
          try {
            sessionStorage.setItem('tg_user', JSON.stringify(tg.initDataUnsafe.user));
          } catch (e) {
            // Ignore
          }
        }
      }
      
      // If no start_param from Telegram, check URL params (for testing or fallback)
      if (!startParam) {
        const urlParams = new URLSearchParams(window.location.search);
        startParam = urlParams.get('tgWebAppStartParam') || urlParams.get('startapp') || null;
      }
      
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
    // Parse start_param: e-{event_id} for events
    if (startParam.startsWith('e-')) {
      const eventId = startParam.substring(2);
      if (eventId && eventId.length > 0) {
        setStatus('redirecting');
        router.replace(`/tg-app/events/${eventId}`);
        return;
      }
    }
    
    // Parse start_param: apply-{form_id} or apply-{form_id}-{source_code} for applications
    if (startParam.startsWith('apply-')) {
      const rest = startParam.substring(6); // Remove 'apply-'
      // UUID is 36 characters, so form_id is first 36 chars
      // Format: apply-{formId} or apply-{formId}-{sourceCode}
      const parts = rest.split('-');
      
      // UUID has format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (5 parts)
      // So formId is first 5 parts joined by '-'
      if (parts.length >= 5) {
        const formId = parts.slice(0, 5).join('-');
        const sourceCode = parts.length > 5 ? parts.slice(5).join('-') : null;
        
        if (formId && formId.length === 36) {
          setStatus('redirecting');
          const url = sourceCode 
            ? `/tg-app/apply/${formId}?s=${sourceCode}`
            : `/tg-app/apply/${formId}`;
          router.replace(url);
          return;
        }
      }
    }
    
    // Login deep link
    if (startParam === 'login') {
      setStatus('redirecting');
      router.replace('/tg-app/login');
      return;
    }

    // Registration deep links
    if (startParam.startsWith('ref_')) {
      setStatus('redirecting');
      router.replace('/tg-app/register');
      return;
    }
    
    // Unknown format
    setErrorMessage(`Неизвестный формат параметра: ${startParam}`);
    setStatus('error');
  };

  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
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
              <p className="text-gray-600">Загрузка...</p>
            </>
          )}

          {status === 'no-event' && (
            <div className="space-y-4">
              <div className="text-6xl">🚀</div>
              <h1 className="text-xl font-bold text-gray-900">Orbo</h1>
              <p className="text-gray-600">
                Платформа для управления сообществами
              </p>
              <div className="space-y-3 pt-2">
                <button
                  onClick={() => router.replace('/tg-app/login')}
                  className="w-full py-3 rounded-lg bg-blue-600 text-white font-medium"
                >
                  Войти
                </button>
                <button
                  onClick={() => router.replace('/tg-app/register')}
                  className="w-full py-3 rounded-lg bg-gray-100 text-gray-700 font-medium"
                >
                  Зарегистрироваться
                </button>
              </div>
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

