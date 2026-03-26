'use client';

import { useState, useEffect } from 'react';
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
  eventId?: string // Optional: extracted from redirect URL if pointing to event
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

  // Extract eventId from redirectUrl if not provided as prop
  const eventId = propEventId || (() => {
    const match = redirectUrl.match(/\/events\/([a-f0-9-]+)/i)
    return match ? match[1] : undefined
  })()

  // Generate code on mount
  useEffect(() => {
    generateCode();
  }, []);

  const generateCode = async () => {
    try {
      setIsGenerating(true);
      setError(null);

      const response = await fetch('/api/auth/telegram-code/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          redirectUrl,
          eventId, // Include eventId for better context
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate code');
      }

      const data = await response.json();
      setGeneratedCode(data.code);
      setBotUsername(data.botUsername);

      // Start polling for verification
      startPolling(data.code);
    } catch (err: any) {
      setError('Не удалось сгенерировать код. Попробуйте еще раз.');
      clientLogger.error({
        error: err.message || String(err),
        stack: err.stack,
        org_id: orgId,
        event_id: propEventId
      }, 'Error generating code');
    } finally {
      setIsGenerating(false);
    }
  };

  const startPolling = (codeToCheck: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/auth/telegram-code/status?code=${codeToCheck}`);
        if (response.ok) {
          const data = await response.json();
          if (data.verified) {
            clearInterval(pollInterval);
            setSuccess(true);
            // Redirect after 1 second
            setTimeout(() => {
              router.push(redirectUrl);
            }, 1000);
          }
        }
      } catch (err) {
        clientLogger.error({
          error: err instanceof Error ? err.message : String(err),
          code: codeToCheck,
          org_id: orgId
        }, 'Error polling status');
      }
    }, 2000); // Poll every 2 seconds

    // Stop polling after 10 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
    }, 10 * 60 * 1000);
  };

  const copyCode = async () => {
    if (!generatedCode) return;
    try {
      await navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
        {/* Back Link */}
        <Link
          href={`/p/${orgId}`}
          className="inline-flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6 text-sm"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Назад в сообщество
        </Link>

        {/* Main Card */}
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
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Telegram
            </button>
            <button
              onClick={() => setAuthTab('email')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                authTab === 'email'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Email
            </button>
          </div>

          {authTab === 'email' ? (
            <ParticipantEmailAuthForm orgId={orgId} />
          ) : success ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Успешно!
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Перенаправляем...
              </p>
            </div>
          ) : (
            <>
              {/* Auto-generated Code Section - fixed min-height prevents CLS */}
              <div className="min-h-[320px]">
                {generatedCode ? (
                  <div>
                    {/* Step 1: Copy the code */}
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      Шаг 1 — скопируйте код:
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
                          <>
                            <Check className="w-4 h-4 text-green-600" />
                            <span className="hidden sm:inline text-green-600">Скопировано</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            <span className="hidden sm:inline">Копировать</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-blue-600 mb-6">
                      Код действителен 10 минут
                    </p>

                    {/* Step 2: Send code to bot */}
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      Шаг 2 — откройте Telegram, найдите бота и отправьте ему код:
                    </p>
                    <div className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 text-sm flex items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold">@{botUsername}</span>
                        <span className="text-gray-400 ml-2 text-xs">найдите в поиске Telegram</span>
                      </div>
                      <CopyBotButton name={botUsername} />
                    </div>
                    <p className="text-xs text-gray-500 text-center mt-2">
                      После отправки кода вы получите ссылку для входа
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
                    <p className="text-gray-600 dark:text-gray-400 font-medium">
                      Генерация кода...
                    </p>
                  </div>
                )}
              </div>

              {/* Error Message */}
              {error && (
                <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-700 dark:text-red-300 mb-1">
                      {error}
                    </p>
                    <button
                      onClick={generateCode}
                      className="text-xs text-red-600 dark:text-red-400 hover:underline font-medium"
                    >
                      Попробовать снова
                    </button>
                  </div>
                </div>
              )}

              {/* Mini-app alternative — secondary small option */}
              {botUsername && (
                <div className="mt-4 pt-4 border-t border-gray-100 text-center">
                  <a
                    href={`https://t.me/${botUsername}?startapp=org-${orgId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-500 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Войти одним кликом
                  </a>
                  <p className="text-xs text-gray-400 mt-0.5">Может не работать при блокировках</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Admin Login Link */}

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Администратор?{' '}
            <Link
              href="/signin"
              className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
            >
              Войти через email →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

