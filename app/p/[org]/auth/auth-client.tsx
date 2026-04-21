'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check, AlertCircle, Loader2, Copy, ExternalLink } from 'lucide-react';
import { createClientLogger } from '@/lib/logger';
import ParticipantEmailAuthForm from '@/components/auth/participant-email-auth-form';

function CopyBotButton({ name }: { name: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(`@${name}`).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="shrink-0 p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors"
      title="Скопировать имя бота"
    >
      {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
    </button>
  )
}

type Props = {
  orgId: string
  redirectUrl: string
  eventId?: string
}

export default function MemberAuthClient({ orgId, redirectUrl, eventId: propEventId }: Props) {
  const router = useRouter();
  const clientLogger = createClientLogger('MemberAuthClient', { orgId, eventId: propEventId });
  const [authTab, setAuthTab] = useState<'telegram' | 'email'>('telegram');

  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [botUsername, setBotUsername] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showSlowHint, setShowSlowHint] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const eventId = propEventId || (() => {
    const match = redirectUrl.match(/\/events\/([a-f0-9-]+)/i)
    return match ? match[1] : undefined
  })()

  useEffect(() => {
    generateCode();
    return () => stopPolling();
  }, []);

  const stopPolling = () => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    if (slowTimerRef.current) { clearTimeout(slowTimerRef.current); slowTimerRef.current = null; }
  };

  const generateCode = async () => {
    try {
      setIsGenerating(true);
      setError(null);
      setShowSlowHint(false);
      setReportSent(false);
      stopPolling();

      const response = await fetch('/api/auth/telegram-code/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, redirectUrl, eventId }),
      });

      if (!response.ok) throw new Error('Failed to generate code');

      const data = await response.json();
      setGeneratedCode(data.code);
      setBotUsername(data.botUsername);
      startPolling(data.code);
    } catch (err: any) {
      setError('Не удалось сгенерировать код. Попробуйте еще раз.');
      clientLogger.error({ error: err.message || String(err), org_id: orgId }, 'Error generating code');
    } finally {
      setIsGenerating(false);
    }
  };

  const startPolling = useCallback((codeToCheck: string) => {
    slowTimerRef.current = setTimeout(() => setShowSlowHint(true), 30_000);

    let tick = 0;
    pollingRef.current = setInterval(async () => {
      tick++;
      try {
        // Проверка 1: код подтверждён ботом → автовход
        const response = await fetch(`/api/auth/telegram-code/status?code=${codeToCheck}`);
        if (response.ok) {
          const data = await response.json();
          if (data.linked) {
            stopPolling();
            setSuccess(true);
            setShowSlowHint(false);
            const fullRedirect = redirectUrl.startsWith('http')
              ? redirectUrl
              : `${window.location.origin}${redirectUrl}`;
            window.location.href = `/auth/telegram-handler?code=${encodeURIComponent(codeToCheck)}&redirect=${encodeURIComponent(fullRedirect)}`;
            return;
          }
        }

        // Проверка 2 (каждые 2 тика = ~6с): есть ли уже живая сессия?
        // Подхватывает авторизацию из другой вкладки (MiniApp, magic link и т.п.).
        if (tick % 2 === 0) {
          const sessionRes = await fetch('/api/user/me');
          if (sessionRes.ok) {
            stopPolling();
            setSuccess(true);
            setShowSlowHint(false);
            window.location.href = redirectUrl;
            return;
          }
        }
      } catch {
        // Тихо — сеть может моргать
      }
    }, 3000);

    // Остановить через 10 минут
    setTimeout(() => stopPolling(), 10 * 60 * 1000);
  }, [redirectUrl]);

  const copyCode = async () => {
    if (!generatedCode) return;
    try {
      await navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.createElement('textarea');
      el.value = generatedCode;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleReportIssue = async () => {
    if (reportSent || !generatedCode) return;
    setReportSent(true);
    try {
      await fetch('/api/auth/telegram-code/report-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: generatedCode, orgId, eventId, userAgent: navigator.userAgent }),
      });
    } catch { /* best-effort */ }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
        <Link
          href={`/p/${orgId}`}
          className="inline-flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6 text-sm"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Назад в сообщество
        </Link>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Войти как участник
          </h1>

          {/* Auth tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
            <button
              onClick={() => setAuthTab('telegram')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                authTab === 'telegram'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Telegram
            </button>
            <button
              onClick={() => setAuthTab('email')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                authTab === 'email'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Email
            </button>
          </div>

          {authTab === 'email' ? (
            <ParticipantEmailAuthForm orgId={orgId} />
          ) : success ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Код принят!</h3>
              <p className="text-gray-600">Выполняется вход...</p>
            </div>
          ) : (
            <>
              <div className="min-h-[340px]">
                {generatedCode ? (
                  <div>
                    {/* ШАГ 1: Открыть бота */}
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold mr-1.5">1</span>
                      Откройте бота в Telegram:
                    </p>
                    <div className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 text-sm flex items-center justify-between gap-2 mb-5">
                      <div>
                        <span className="font-semibold">@{botUsername}</span>
                        <span className="text-gray-400 ml-2 text-xs">найдите в поиске Telegram</span>
                      </div>
                      <CopyBotButton name={botUsername} />
                    </div>

                    {/* ШАГ 2: Скопировать и отправить код */}
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold mr-1.5">2</span>
                      Скопируйте код и отправьте его боту:
                    </p>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg px-6 py-5 mb-1 flex items-center justify-between gap-4">
                      <div className="text-4xl font-bold text-blue-600 tracking-widest font-mono">
                        {generatedCode}
                      </div>
                      <button
                        onClick={copyCode}
                        title="Скопировать код"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-blue-200 hover:border-blue-400 text-blue-600 text-sm font-medium transition-colors flex-shrink-0"
                      >
                        {copied ? (
                          <><Check className="w-4 h-4 text-green-600" /><span className="hidden sm:inline text-green-600">Скопировано</span></>
                        ) : (
                          <><Copy className="w-4 h-4" /><span className="hidden sm:inline">Копировать</span></>
                        )}
                      </button>
                    </div>
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-xs text-blue-600">Код действителен 10 минут</p>
                      {!success && generatedCode && (
                        <span className="inline-flex items-center gap-1 text-xs text-blue-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                          ожидаем ответ бота
                        </span>
                      )}
                    </div>

                    {/* Подсказка «Бот не ответил?» — через 10 секунд */}
                    {showSlowHint && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
                        <p className="text-sm text-amber-800 font-medium mb-1">Бот не ответил?</p>
                        <p className="text-xs text-amber-700 mb-2">
                          Иногда Telegram задерживает доставку сообщений. Попробуйте получить новый код или войти через Email.
                        </p>
                        <div className="flex items-center gap-3">
                          <button onClick={generateCode} className="text-xs font-medium text-amber-800 underline hover:text-amber-900">
                            Новый код
                          </button>
                          {!reportSent ? (
                            <button onClick={handleReportIssue} className="text-xs font-medium text-amber-800 underline hover:text-amber-900">
                              Сообщить о проблеме
                            </button>
                          ) : (
                            <span className="text-xs text-green-700">Спасибо, мы получили сигнал.</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
                    <p className="text-gray-600 font-medium">Генерация кода...</p>
                  </div>
                )}
              </div>

              {error && (
                <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-700 mb-1">{error}</p>
                    <button onClick={generateCode} className="text-xs text-red-600 hover:underline font-medium">
                      Попробовать снова
                    </button>
                  </div>
                </div>
              )}

              {/* «Войти одним кликом» — синяя кнопка */}
              {botUsername && (
                <div className="mt-4 pt-4 border-t border-gray-100 text-center">
                  <a
                    href={`https://t.me/${botUsername}?startapp=org-${orgId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-blue-700 text-sm font-medium transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Войти одним кликом через MiniApp
                  </a>
                  <p className="text-xs text-gray-400 mt-1.5">Может не работать при блокировках Telegram</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Администратор?{' '}
            <Link href="/signin" className="text-blue-600 hover:text-blue-700 font-medium">
              Войти через email →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
