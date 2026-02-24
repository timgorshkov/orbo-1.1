'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';

type LoginStatus = 'loading' | 'authorizing' | 'success' | 'not_found' | 'multiple' | 'error';

export default function TelegramLoginPage() {
  const [status, setStatus] = useState<LoginStatus>('loading');
  const [message, setMessage] = useState('');
  const [userName, setUserName] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => attemptLogin(), 200);
    return () => clearTimeout(timer);
  }, []);

  async function attemptLogin() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tg = (window as any).Telegram?.WebApp;
      if (!tg) {
        setStatus('error');
        setMessage('Откройте через Telegram');
        return;
      }

      tg.ready();
      tg.expand();

      const initData = tg.initData;
      if (!initData || initData.length === 0) {
        setStatus('error');
        setMessage('Не удалось получить данные Telegram');
        return;
      }

      setStatus('authorizing');

      const res = await fetch('/api/telegram/registration/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus('error');
        setMessage(data.error || 'Ошибка авторизации');
        return;
      }

      if (data.status === 'ok') {
        setStatus('success');
        setUserName(data.userName || '');
        // Redirect to auto-login via opening in external browser
        if (tg.openLink) {
          tg.openLink(data.loginUrl, { try_instant_view: false });
        } else {
          window.open(data.loginUrl, '_blank');
        }
        setTimeout(() => tg.close(), 1500);
        return;
      }

      if (data.status === 'not_found') {
        setStatus('not_found');
        setMessage(data.message);
        return;
      }

      if (data.status === 'multiple') {
        setStatus('multiple');
        setMessage(data.message);
        return;
      }

      setStatus('error');
      setMessage('Неизвестная ошибка');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Ошибка соединения');
    }
  }

  function handleClose() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.close) tg.close();
  }

  function handleGoToSignup() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tg = (window as any).Telegram?.WebApp;
    const signupUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru') + '/signup';
    if (tg?.openLink) {
      tg.openLink(signupUrl, { try_instant_view: false });
    } else {
      window.open(signupUrl, '_blank');
    }
  }

  function handleGoToSignin() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tg = (window as any).Telegram?.WebApp;
    const signinUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru') + '/signin';
    if (tg?.openLink) {
      tg.openLink(signinUrl, { try_instant_view: false });
    } else {
      window.open(signinUrl, '_blank');
    }
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
                {userName ? `Здравствуйте, ${userName}!` : 'Вход выполнен!'}
              </h1>
              <p style={{ color: '#6b7280' }}>
                Открываем Orbo в браузере...
              </p>
              <p className="text-xs" style={{ color: '#9ca3af' }}>
                Если ничего не произошло, закройте это окно и перейдите на my.orbo.ru
              </p>
            </>
          )}

          {status === 'not_found' && (
            <>
              <div className="text-6xl">🔍</div>
              <h1 className="text-xl font-bold" style={{ color: '#111827' }}>
                Аккаунт не найден
              </h1>
              <p style={{ color: '#6b7280' }}>
                К вашему Telegram не привязан аккаунт Orbo.
              </p>
              <div className="space-y-3 pt-2">
                <button
                  onClick={handleGoToSignup}
                  className="w-full py-3 rounded-lg font-medium text-white"
                  style={{ backgroundColor: '#2563eb' }}
                >
                  Зарегистрироваться
                </button>
                <button
                  onClick={handleClose}
                  className="w-full py-3 rounded-lg font-medium"
                  style={{ backgroundColor: '#f3f4f6', color: '#374151' }}
                >
                  Закрыть
                </button>
              </div>
            </>
          )}

          {status === 'multiple' && (
            <>
              <div className="text-6xl">👥</div>
              <h1 className="text-xl font-bold" style={{ color: '#111827' }}>
                Несколько аккаунтов
              </h1>
              <p style={{ color: '#6b7280' }}>
                К вашему Telegram привязано несколько аккаунтов Orbo. 
                Для безопасности войдите по email.
              </p>
              <div className="space-y-3 pt-2">
                <button
                  onClick={handleGoToSignin}
                  className="w-full py-3 rounded-lg font-medium text-white"
                  style={{ backgroundColor: '#2563eb' }}
                >
                  Войти по email
                </button>
                <button
                  onClick={handleClose}
                  className="w-full py-3 rounded-lg font-medium"
                  style={{ backgroundColor: '#f3f4f6', color: '#374151' }}
                >
                  Закрыть
                </button>
              </div>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="text-6xl">❌</div>
              <h1 className="text-xl font-bold" style={{ color: '#dc2626' }}>
                Ошибка
              </h1>
              <p style={{ color: '#6b7280' }}>{message}</p>
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
