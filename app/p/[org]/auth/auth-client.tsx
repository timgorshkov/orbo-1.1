'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Send, Check, AlertCircle, Loader2, Copy, ExternalLink } from 'lucide-react';
import { createClientLogger } from '@/lib/logger';

type Props = {
  orgId: string
  redirectUrl: string
  eventId?: string // Optional: extracted from redirect URL if pointing to event
}

export default function MemberAuthClient({ orgId, redirectUrl, eventId: propEventId }: Props) {
  const router = useRouter();
  const clientLogger = createClientLogger('MemberAuthClient', { orgId, eventId: propEventId });

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

  const openTelegramBot = () => {
    if (botUsername) {
      window.open(`https://t.me/${botUsername}`, '_blank');
    }
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
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            Используйте Telegram для быстрой авторизации
          </p>

          {success ? (
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
                            <span className="text-green-600">Скопировано</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            <span>Копировать</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-blue-600 mb-6">
                      Код действителен 10 минут
                    </p>

                    {/* Step 2: Open bot and send code */}
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      Шаг 2 — откройте бота и отправьте ему скопированный код:
                    </p>
                    <button
                      onClick={openTelegramBot}
                      className="w-full px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <Send className="w-5 h-5" />
                      Открыть @{botUsername}
                    </button>
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

              {/* Mini-app alternative */}
              {botUsername && (
                <div className="mt-6 pt-5 border-t border-gray-200">
                  <p className="text-center text-xs text-gray-400 mb-3">или быстрый вход</p>
                  <a
                    href={`https://t.me/${botUsername}?startapp=org-${orgId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-gray-600 hover:text-blue-700 text-sm font-medium transition-colors"
                  >
                    <ExternalLink className="w-4 h-4 flex-shrink-0" />
                    Открыть мини-приложение Orbo
                  </a>
                  <p className="text-xs text-gray-400 text-center mt-2">
                    Если уже авторизованы в боте — войдёт автоматически
                  </p>
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

