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
    // First: check URL query params immediately — no SDK needed.
    // MAX may append ?startapp=... directly to the configured WebApp URL.
    const urlParams = new URLSearchParams(window.location.search);
    const urlStartParam = urlParams.get('startapp') || urlParams.get('start_param') || null;
    if (urlStartParam) {
      processStartParam(urlStartParam);
      return;
    }

    // Second: poll for MAX WebApp SDK to become available (up to 2 seconds).
    // SDK sets window.WebApp and injects initDataUnsafe.start_param.
    let attempts = 0;
    const MAX_ATTEMPTS = 20;

    const tryInit = () => {
      attempts++;
      const wa = (window as any).WebApp;

      if (wa) {
        try {
          wa.ready?.();
          wa.expand?.();
        } catch {}

        // Save initData for subsequent pages
        if (wa.initData?.length > 0) {
          try { sessionStorage.setItem('max_init_data', wa.initData); } catch {}
        }
        if (wa.initDataUnsafe?.user) {
          try { sessionStorage.setItem('max_user', JSON.stringify(wa.initDataUnsafe.user)); } catch {}
        }

        const sdkStartParam = wa.initDataUnsafe?.start_param || null;
        if (sdkStartParam) {
          processStartParam(sdkStartParam);
          return;
        }
      }

      if (attempts >= MAX_ATTEMPTS) {
        // SDK loaded but no start_param — nothing to route to
        setStatus('no-param');
      }
    };

    const interval = setInterval(() => {
      tryInit();
      if (attempts >= MAX_ATTEMPTS) clearInterval(interval);
    }, 100);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processStartParam = (startParam: string) => {
    // e-{eventId} → event registration page
    if (startParam.startsWith('e-')) {
      const eventId = startParam.substring(2);
      if (eventId.length > 0) {
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
      <Script src="https://dev.max.ru/max-web-app.js" strategy="afterInteractive" />

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
