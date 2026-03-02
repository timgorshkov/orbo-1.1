'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * MAX Mini App entry point.
 *
 * MAX opens the configured bot WebApp URL with:
 *   ?WebAppStartParam=e-{eventId}  — start param in query
 *   #WebAppData=<url-encoded initData>&WebAppPlatform=android&WebAppVersion=x
 *                                   — full initData (user, auth_date, hash) in hash
 *
 * window.WebApp SDK is NOT used by MAX — everything is in the URL.
 */
export default function MaxAppHome() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'redirecting' | 'no-param' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [diagInfo, setDiagInfo] = useState<string>('');

  useEffect(() => {
    try {
      // ── 1. Extract initData from URL hash and persist to sessionStorage ─────
      // Hash format: #WebAppData=<url-encoded-initData>&WebAppPlatform=...
      let initDataFromHash = '';
      const rawHash = window.location.hash;
      if (rawHash) {
        const hashParams = new URLSearchParams(rawHash.slice(1)); // remove leading #
        const webAppData = hashParams.get('WebAppData');
        if (webAppData) {
          initDataFromHash = webAppData; // already decoded once by URLSearchParams
          try { sessionStorage.setItem('max_init_data', webAppData); } catch {}

          // Also persist the user object for subsequent pages
          try {
            const innerParams = new URLSearchParams(webAppData);
            const userStr = innerParams.get('user');
            if (userStr) {
              sessionStorage.setItem('max_user', userStr);
            }
          } catch {}
        }
      }

      // ── 2. Find start_param ────────────────────────────────────────────────
      // Primary: ?WebAppStartParam= query param
      const urlParams = new URLSearchParams(window.location.search);
      const startParam =
        urlParams.get('WebAppStartParam') ||
        urlParams.get('startapp') ||
        urlParams.get('start_param') ||
        // Fallback: start_param field inside the initData hash
        (() => {
          try {
            return new URLSearchParams(initDataFromHash).get('start_param');
          } catch {
            return null;
          }
        })() ||
        null;

      if (startParam) {
        processStartParam(startParam);
      } else {
        const diag = {
          href: window.location.href,
          search: window.location.search,
          hash: window.location.hash.substring(0, 200),
          initDataFromHash: initDataFromHash ? initDataFromHash.substring(0, 100) + '...' : null,
        };
        setDiagInfo(JSON.stringify(diag, null, 2));
        setStatus('no-param');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processStartParam = (startParam: string) => {
    if (startParam.startsWith('e-')) {
      const eventId = startParam.substring(2);
      if (eventId.length > 0) {
        setStatus('redirecting');
        router.replace(`/max-app/events/${eventId}`);
        return;
      }
    }
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
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center">
        {(status === 'loading' || status === 'redirecting') && (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4" />
            <p className="text-gray-600">Загрузка...</p>
          </>
        )}

        {status === 'no-param' && (
          <div className="space-y-3 text-left max-w-sm w-full">
            <p className="text-sm font-semibold text-gray-700">Диагностика MAX WebApp</p>
            <pre className="text-xs bg-gray-100 rounded p-3 overflow-auto max-h-96 whitespace-pre-wrap break-all">
              {diagInfo || 'Нет данных'}
            </pre>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <h1 className="text-xl font-bold text-red-600">Ошибка</h1>
            <p className="text-gray-600 text-sm">{errorMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
}
