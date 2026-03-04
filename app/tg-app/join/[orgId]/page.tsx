'use client';

import { use, useEffect, useState } from 'react';
import Script from 'next/script';

type Status = 'loading' | 'authorizing' | 'success' | 'not_member' | 'error';

export default function JoinOrgPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);

  const [status, setStatus] = useState<Status>('loading');
  const [orgName, setOrgName] = useState('');
  const [userName, setUserName] = useState('');
  const [sessionUrl, setSessionUrl] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => attemptJoin(), 200);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function attemptJoin() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tg = (window as any).Telegram?.WebApp;
      if (!tg) {
        setStatus('error');
        setErrorMessage('Откройте через Telegram');
        return;
      }

      tg.ready();
      tg.expand();

      const initData = tg.initData;
      if (!initData || initData.length === 0) {
        setStatus('error');
        setErrorMessage('Не удалось получить данные Telegram');
        return;
      }

      setStatus('authorizing');

      const res = await fetch('/api/telegram/webapp/join-org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, orgId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus('error');
        setErrorMessage(data.error || 'Ошибка авторизации');
        return;
      }

      if (data.status === 'not_member') {
        setOrgName(data.orgName || '');
        setStatus('not_member');
        return;
      }

      if (data.status === 'ok') {
        setOrgName(data.orgName || '');
        setUserName(data.userName || '');
        setSessionUrl(data.sessionUrl || '');
        setStatus('success');
        return;
      }

      setStatus('error');
      setErrorMessage('Неизвестная ошибка');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Ошибка соединения');
    }
  }

  function openLink(url: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.openLink) {
      tg.openLink(url, { try_instant_view: false });
    } else {
      window.open(url, '_blank');
    }
  }

  function handleClose() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.close) tg.close();
  }

  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="beforeInteractive"
      />

      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#ffffff' }}>
        <div className="w-full max-w-sm text-center space-y-6">

          {(status === 'loading' || status === 'authorizing') && (
            <>
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto" />
              <p style={{ color: '#6b7280' }}>
                {status === 'loading' ? 'Загрузка...' : 'Авторизация...'}
              </p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="text-6xl">✅</div>
              <h1 className="text-xl font-bold" style={{ color: '#111827' }}>
                {userName ? `Здравствуйте, ${userName}!` : 'Готово!'}
              </h1>
              <p style={{ color: '#6b7280' }}>
                Нажмите кнопку, чтобы войти в пространство{orgName ? ` «${orgName}»` : ''}.
              </p>
              {sessionUrl && (
                <button
                  onClick={() => openLink(sessionUrl)}
                  className="w-full py-3.5 rounded-xl font-semibold text-lg text-white shadow-lg active:scale-95 transition-transform"
                  style={{ background: 'linear-gradient(to right, #2563eb, #7c3aed)' }}
                >
                  Войти в пространство →
                </button>
              )}
              <p className="text-xs" style={{ color: '#9ca3af' }}>
                Откроется браузер с вашим аккаунтом
              </p>
            </>
          )}

          {status === 'not_member' && (
            <>
              <div className="text-6xl">🔒</div>
              <h1 className="text-xl font-bold" style={{ color: '#111827' }}>
                Доступ ограничен
              </h1>
              <p style={{ color: '#6b7280' }}>
                Ваш Telegram не привязан к{orgName ? ` пространству «${orgName}»` : ' этому пространству'}.
                Используйте шестизначный код для входа.
              </p>
              <button
                onClick={handleClose}
                className="w-full py-3 rounded-lg font-medium"
                style={{ backgroundColor: '#f3f4f6', color: '#374151' }}
              >
                Закрыть
              </button>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="text-6xl">❌</div>
              <h1 className="text-xl font-bold" style={{ color: '#dc2626' }}>
                Ошибка
              </h1>
              <p style={{ color: '#6b7280' }}>{errorMessage}</p>
              <button
                onClick={handleClose}
                className="w-full py-3 rounded-lg font-medium"
                style={{ backgroundColor: '#f3f4f6', color: '#374151' }}
              >
                Закрыть
              </button>
            </>
          )}

        </div>
      </div>
    </>
  );
}
