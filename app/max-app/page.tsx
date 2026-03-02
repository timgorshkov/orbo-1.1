'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';

/**
 * MAX Mini App entry point.
 * MAX opens this URL when the user clicks a mini-app link.
 * Reads start_param from MAX WebApp SDK and redirects to the appropriate page.
 *
 * Configured bot WebApp URL: https://my.orbo.ru/max-app
 * Link format: https://max.ru/{botUsername}?startapp=e-{eventId}
 */
export default function MaxAppHome() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'redirecting' | 'no-param' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const timer = setTimeout(() => {
      handleRedirect();
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const handleRedirect = () => {
    try {
      const wa = (window as any).WebApp;

      let startParam: string | null = null;

      if (wa) {
        wa.ready?.();
        wa.expand?.();

        startParam = wa.initDataUnsafe?.start_param || null;

        if (wa.initData && wa.initData.length > 0) {
          try { sessionStorage.setItem('max_init_data', wa.initData); } catch {}
        }
        if (wa.initDataUnsafe?.user) {
          try { sessionStorage.setItem('max_user', JSON.stringify(wa.initDataUnsafe.user)); } catch {}
        }
      }

      // Fallback: check URL query params (useful for testing)
      if (!startParam) {
        const urlParams = new URLSearchParams(window.location.search);
        startParam = urlParams.get('startapp') || urlParams.get('start_param') || null;
      }

      if (startParam) {
        processStartParam(startParam);
      } else {
        setStatus('no-param');
      }
    } catch (error) {
      console.error('[MaxApp] Error handling redirect:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error');
      setStatus('error');
    }
  };

  const processStartParam = (startParam: string) => {
    // e-{eventId} → event registration page
    if (startParam.startsWith('e-')) {
      const eventId = startParam.substring(2);
      if (eventId && eventId.length > 0) {
        setStatus('redirecting');
        router.replace(`/max-app/events/${eventId}`);
        return;
      }
    }

    // Raw UUID → event registration page
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(startParam)) {
      setStatus('redirecting');
      router.replace(`/max-app/events/${startParam}`);
      return;
    }

    setErrorMessage(`Неизвестный формат параметра: ${startParam}`);
    setStatus('error');
  };

  return (
    <>
      <Script
        src="https://dev.max.ru/max-web-app.js"
        strategy="beforeInteractive"
      />

      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          {(status === 'loading' || status === 'redirecting') && (
            <>
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4" />
              <p className="text-gray-600">Загрузка...</p>
            </>
          )}

          {status === 'no-param' && (
            <div className="space-y-4">
              <div className="text-5xl">🚀</div>
              <h1 className="text-xl font-bold text-gray-900">Orbo</h1>
              <p className="text-gray-500 text-sm">
                Откройте ссылку на событие, чтобы зарегистрироваться.
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <div className="text-5xl">⚠️</div>
              <h1 className="text-xl font-bold text-red-600">Ошибка</h1>
              <p className="text-gray-600 text-sm">{errorMessage}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
