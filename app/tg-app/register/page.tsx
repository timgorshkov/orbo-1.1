'use client';

import { useEffect, useState, useRef } from 'react';
import Script from 'next/script';

interface TgUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

type Step = 'loading' | 'exists' | 'form' | 'submitting' | 'done' | 'autologin' | 'error';

export default function TelegramRegisterPage() {
  const [step, setStep] = useState<Step>('loading');
  const [tgUser, setTgUser] = useState<TgUser | null>(null);
  const [initData, setInitData] = useState<string>('');
  const [campaignRef, setCampaignRef] = useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loginUrl, setLoginUrl] = useState('');
  const [emailSent, setEmailSent] = useState(true);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const timer = setTimeout(() => {
      initTelegram();
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  async function initTelegram() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tg = (window as any).Telegram?.WebApp;
      if (!tg) {
        setError('Откройте приложение через Telegram');
        setStep('error');
        return;
      }

      tg.ready();
      tg.expand();

      const data = tg.initData;
      const user = tg.initDataUnsafe?.user as TgUser | undefined;
      const startParam = tg.initDataUnsafe?.start_param || null;

      if (!data || !user) {
        setError('Не удалось получить данные из Telegram');
        setStep('error');
        return;
      }

      setInitData(data);
      setTgUser(user);

      if (startParam?.startsWith('ref_')) {
        setCampaignRef(startParam);
      }

      // Check if account already exists
      const res = await fetch('/api/telegram/registration/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: data }),
      });

      const result = await res.json();

      if (!res.ok) {
        setError(result.error || 'Ошибка проверки');
        setStep('error');
        return;
      }

      if (result.exists) {
        try {
          const loginRes = await fetch('/api/telegram/registration/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: data }),
          });
          const loginResult = await loginRes.json();

          if (loginResult.status === 'ok' && loginResult.loginUrl) {
            setLoginUrl(loginResult.loginUrl);
            setStep('autologin');
            return;
          }

          if (loginResult.status === 'multiple') {
            setMaskedEmail(result.maskedEmail || '');
            setLoginUrl(result.loginUrl || 'https://my.orbo.ru/signin');
            setStep('exists');
            return;
          }
        } catch {
          // Fall through to exists step on error
        }

        setMaskedEmail(result.maskedEmail || '');
        setLoginUrl(result.loginUrl || 'https://my.orbo.ru/signin');
        setStep('exists');
      } else {
        setStep('form');
      }
    } catch {
      setError('Ошибка инициализации');
      setStep('error');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStep('submitting');
    setError('');

    try {
      const res = await fetch('/api/telegram/registration/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initData,
          email: email.trim().toLowerCase(),
          campaignRef,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setError(result.error || 'Ошибка регистрации');
        setStep('form');
        return;
      }

      setLoginUrl(result.loginUrl || '');
      setEmailSent(result.emailSent !== false);
      setStep('done');
    } catch {
      setError('Произошла ошибка. Попробуйте позже.');
      setStep('form');
    }
  }

  function openLink(url: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.openLink) {
      tg.openLink(url);
    } else {
      window.open(url, '_blank');
    }
  }

  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="beforeInteractive"
      />

      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#ffffff' }}>
        <div className="w-full max-w-sm">

          {step === 'loading' && (
            <div className="text-center space-y-4">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto" />
              <p style={{ color: '#6b7280' }}>Загрузка...</p>
            </div>
          )}

          {step === 'exists' && (
            <div className="text-center space-y-5">
              <div className="text-5xl">👋</div>
              <h1 className="text-xl font-bold" style={{ color: '#111827' }}>
                У вас несколько аккаунтов
              </h1>
              <p style={{ color: '#4b5563' }}>
                К Telegram-аккаунту {tgUser?.first_name} привязано несколько аккаунтов Orbo. 
                Войдите по email{maskedEmail && <> ({maskedEmail})</>}.
              </p>
              <button
                onClick={() => openLink(loginUrl)}
                className="w-full py-3 px-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-medium"
              >
                Войти по email на my.orbo.ru
              </button>
            </div>
          )}

          {(step === 'form' || step === 'submitting') && (
            <div className="space-y-5">
              <div className="text-center">
                <div className="text-5xl mb-3">🚀</div>
                <h1 className="text-xl font-bold" style={{ color: '#111827' }}>
                  Добро пожаловать в Orbo
                </h1>
                <p className="text-sm mt-1" style={{ color: '#6b7280' }}>
                  Платформа для управления сообществами
                </p>
              </div>

              {tgUser && (
                <div className="flex items-center gap-3 rounded-xl p-3" style={{ backgroundColor: '#f9fafb' }}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold" style={{ backgroundColor: '#dbeafe', color: '#2563eb' }}>
                    {tgUser.first_name[0]}
                  </div>
                  <div>
                    <p className="font-medium text-sm" style={{ color: '#111827' }}>
                      {tgUser.first_name}{tgUser.last_name ? ` ${tgUser.last_name}` : ''}
                    </p>
                    {tgUser.username && (
                      <p className="text-xs" style={{ color: '#9ca3af' }}>@{tgUser.username}</p>
                    )}
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: '#374151' }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    style={{ backgroundColor: '#ffffff', color: '#111827' }}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>
                    Для входа и уведомлений. На этот адрес придёт подтверждение.
                  </p>
                </div>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={step === 'submitting'}
                  className="w-full py-3 px-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-medium disabled:opacity-50"
                >
                  {step === 'submitting' ? 'Регистрация...' : 'Продолжить'}
                </button>
              </form>

              <p className="text-center text-xs" style={{ color: '#9ca3af' }}>
                Бесплатно для сообществ до 500 участников
              </p>
            </div>
          )}

          {step === 'autologin' && (
            <div className="text-center space-y-5">
              <div className="text-5xl">✅</div>
              <h1 className="text-xl font-bold" style={{ color: '#111827' }}>
                Вы авторизованы!
              </h1>
              <p style={{ color: '#4b5563' }}>
                {tgUser?.first_name}, нажмите кнопку ниже, чтобы перейти в Orbo.
              </p>
              {loginUrl && (
                <button
                  onClick={() => openLink(loginUrl)}
                  className="w-full py-3.5 px-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold text-lg shadow-lg active:scale-95 transition-transform"
                >
                  Открыть Orbo →
                </button>
              )}
              <p className="text-xs" style={{ color: '#9ca3af' }}>
                Также вы можете перейти по ссылке my.orbo.ru в браузере.
              </p>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center space-y-5">
              <div className="text-5xl">🎉</div>
              <h1 className="text-xl font-bold" style={{ color: '#111827' }}>
                Аккаунт создан!
              </h1>
              {emailSent ? (
                <p style={{ color: '#4b5563' }}>
                  На <strong>{email}</strong> отправлено письмо для подтверждения.
                </p>
              ) : (
                <p style={{ color: '#4b5563' }}>
                  Не удалось отправить письмо на <strong>{email}</strong>. Подтвердите email позже в настройках.
                </p>
              )}
              {loginUrl && (
                <button
                  onClick={() => openLink(loginUrl)}
                  className="w-full py-3.5 px-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold text-lg shadow-lg active:scale-95 transition-transform"
                >
                  Перейти в Orbo →
                </button>
              )}
              <p className="text-xs" style={{ color: '#9ca3af' }}>
                {emailSent ? 'Не пришло письмо? Проверьте папку «Спам».' : 'Нажмите кнопку выше, чтобы начать работу.'}
              </p>
            </div>
          )}

          {step === 'error' && (
            <div className="text-center space-y-4">
              <div className="text-5xl">😔</div>
              <h1 className="text-xl font-bold" style={{ color: '#111827' }}>Ошибка</h1>
              <p style={{ color: '#4b5563' }}>{error}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
