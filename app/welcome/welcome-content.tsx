'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { QualificationForm } from '@/components/onboarding/qualification-form';
import { Mail, CheckCircle2, Send, Users, Shield, ArrowRight, Copy, Check, ExternalLink } from 'lucide-react';
import { ymGoal } from '@/components/analytics/YandexMetrika';
import { getRegistrationMeta, clearRegistrationMeta } from '@/lib/client/registration-meta';

function EmailVerificationStep({ onVerified }: { onVerified: () => void }) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError('');

    try {
      const res = await fetch('/api/auth/email/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Не удалось отправить письмо');
        setSending(false);
        return;
      }
      setSent(true);
      ymGoal('tg_email_verification_sent', undefined, { once: true });
    } catch {
      setError('Произошла ошибка. Попробуйте позже.');
      setSending(false);
    }
  }

  function handleSkip() {
    ymGoal('tg_email_verification_skipped', undefined, { once: true });
    onVerified();
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="w-full max-w-md border-0 shadow-lg">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle>Проверьте почту</CardTitle>
            <CardDescription>
              Мы отправили ссылку для подтверждения на <strong>{email}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-500 text-center">
              После подтверждения email вы сможете входить по нему.
            </p>
            <Button variant="outline" className="w-full" onClick={handleSkip}>
              Продолжить без подтверждения
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md border-0 shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
            <Mail className="w-8 h-8 text-blue-600" />
          </div>
          <CardTitle>Укажите ваш email</CardTitle>
          <CardDescription>
            Он понадобится для входа на платформу. Мы отправим ссылку для подтверждения.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="h-11"
            />
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
            <Button type="submit" className="w-full h-11" disabled={sending}>
              {sending ? 'Отправка...' : 'Подтвердить email'}
            </Button>
            <Button type="button" variant="ghost" className="w-full text-gray-500" onClick={handleSkip}>
              Пропустить
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function getContextMessage(fromPage?: string, utmCampaign?: string): {
  headline: string;
  subtitle: string;
  ctaLabel: string;
} {
  if (fromPage === 'telegram-backup' || utmCampaign?.includes('backup') || utmCampaign?.includes('block')) {
    return {
      headline: 'Чтобы сохранить базу участников, подключите Telegram',
      subtitle: 'Бот начнёт собирать профили участников вашей группы автоматически. Даже если Telegram заблокируют — контакты останутся у вас.',
      ctaLabel: 'Подключить Telegram',
    };
  }
  if (fromPage === 'events') {
    return {
      headline: 'Подключите Telegram для MiniApp и событий',
      subtitle: 'После подключения вы сможете создать MiniApp для регистрации прямо в Telegram и настроить автоматические напоминания.',
      ctaLabel: 'Подключить Telegram',
    };
  }
  return {
    headline: 'Подключите Telegram, чтобы начать',
    subtitle: 'Orbo работает с вашими группами в Telegram. Подключите аккаунт — и бот начнёт собирать базу участников.',
    ctaLabel: 'Подключить Telegram',
  };
}

// Max polling attempts before showing a manual fallback (2.5s × 72 = 3 minutes)
const MAX_POLL_ATTEMPTS = 72;
const POLL_INTERVAL_MS = 2500;

function TelegramConnectStep({
  onConnected,
  onSkip,
  fromPage,
  utmCampaign,
}: {
  onConnected: () => void;
  onSkip: () => void;
  fromPage?: string;
  utmCampaign?: string;
}) {
  const ctx = getContextMessage(fromPage, utmCampaign);

  const [code, setCode] = useState<string | null>(null);
  const [botUsername, setBotUsername] = useState(
    process.env.NEXT_PUBLIC_TELEGRAM_REGISTRATION_BOT_USERNAME || 'orbo_start_bot'
  );
  const [codeError, setCodeError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [botCopied, setBotCopied] = useState(false);

  const [pollStatus, setPollStatus] = useState<'idle' | 'waiting' | 'connected' | 'timeout'>('idle');
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollCount = useRef(0);

  // Generate code on mount
  useEffect(() => {
    fetch('/api/auth/telegram-code/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then(r => r.json())
      .then(data => {
        if (data.code) {
          setCode(data.code);
          if (data.botUsername) setBotUsername(data.botUsername);
        } else {
          setCodeError(true);
        }
      })
      .catch(() => setCodeError(true));
  }, []);

  // Start polling as soon as code is ready
  useEffect(() => {
    if (code && pollStatus === 'idle') {
      startPolling(code);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => {
    return () => { if (pollTimer.current) clearTimeout(pollTimer.current); };
  }, []);

  const handleCopyCode = () => {
    if (!code) return;
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startPolling = (codeValue: string) => {
    pollCount.current = 0;
    setPollStatus('waiting');

    const tick = async () => {
      pollCount.current++;

      if (pollCount.current > MAX_POLL_ATTEMPTS) {
        setPollStatus('timeout');
        return;
      }

      try {
        const res = await fetch(`/api/auth/telegram-code/status?code=${codeValue}`);
        if (res.ok) {
          const data = await res.json();
          if (data.linked) {
            setPollStatus('connected');
            ymGoal('telegram_account_connected', undefined, { once: true });
            onConnected();
            return;
          }
        }
      } catch { /* network hiccup — retry next tick */ }

      pollTimer.current = setTimeout(tick, POLL_INTERVAL_MS);
    };

    pollTimer.current = setTimeout(tick, POLL_INTERVAL_MS);
  };

  // Manual re-check for timeout / fallback case
  const handleManualCheck = async () => {
    try {
      const res = await fetch('/api/user/me');
      if (res.ok) {
        const data = await res.json();
        if (data.tg_user_id || data.hasTelegramAccount) {
          ymGoal('telegram_account_connected', undefined, { once: true });
          onConnected();
          return;
        }
      }
    } catch { /* ignore */ }
    // Restart polling if code is still valid
    if (code) {
      setPollStatus('idle');
      startPolling(code);
    }
  };

  const deepLink = code
    ? `https://t.me/${botUsername}?start=${code}`
    : `https://t.me/${botUsername}`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-lg border-0 shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
            <Send className="w-8 h-8 text-blue-600" />
          </div>
          <CardTitle className="text-xl leading-snug">{ctx.headline}</CardTitle>
          <CardDescription className="text-base mt-2">{ctx.subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">

          {pollStatus === 'connected' ? (
            <div className="flex items-center justify-center gap-2 text-green-600 font-medium py-2">
              <CheckCircle2 className="w-5 h-5" />
              Telegram подключён!
            </div>
          ) : (
            <>
              {/* Instruction */}
              <div className="flex items-center gap-1.5 flex-wrap text-sm text-gray-700">
                <span>Откройте</span>
                <span className="font-semibold">@{botUsername}</span>
                <button
                  onClick={() => { navigator.clipboard.writeText(`@${botUsername}`).catch(() => {}); setBotCopied(true); setTimeout(() => setBotCopied(false), 2000); }}
                  className="inline-flex items-center p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  title="Скопировать имя бота"
                >
                  {botCopied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <span>в Telegram и отправьте этот код:</span>
              </div>

              {/* Primary: code block */}
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-4">
                {code ? (
                  <div className="flex items-center gap-3">
                    <span className="flex-1 font-mono text-3xl font-bold tracking-widest text-blue-700 select-all text-center">
                      {code}
                    </span>
                    <button
                      onClick={handleCopyCode}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-blue-200 hover:border-blue-400 text-blue-600 text-sm font-medium transition-colors"
                    >
                      {copied ? (
                        <><Check className="w-4 h-4 text-green-500" /><span className="hidden sm:inline text-green-600">Скопировано</span></>
                      ) : (
                        <><Copy className="w-4 h-4" /><span className="hidden sm:inline">Копировать</span></>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="text-center text-sm text-blue-400 py-2">Генерация кода...</div>
                )}
              </div>

              {/* Polling status */}
              {pollStatus === 'waiting' && (
                <div className="flex items-center justify-center gap-2 text-sm text-blue-600">
                  <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  Ожидаем подтверждение от бота…
                </div>
              )}
              {pollStatus === 'timeout' && (
                <div className="text-center space-y-2">
                  <p className="text-sm text-gray-500">Не получили подтверждения. Попробуйте отправить код заново.</p>
                  <Button variant="outline" size="sm" onClick={handleManualCheck}>
                    Проверить подключение
                  </Button>
                </div>
              )}

              {codeError && (
                <p className="text-xs text-amber-600 text-center">
                  Не удалось подготовить код. Обновите страницу и попробуйте снова.
                </p>
              )}

              {/* Secondary: t.me link */}
              {code && (
                <div className="text-center">
                  <a
                    href={deepLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-500 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Открыть бота в один клик
                  </a>
                  <p className="text-xs text-gray-400 mt-0.5">Может не работать при блокировках</p>
                </div>
              )}
            </>
          )}

          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Users className="w-3.5 h-3.5" />
              <span>Бот собирает только публичную активность участников</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Shield className="w-3.5 h-3.5" />
              <span>Данные хранятся на серверах в России (Selectel)</span>
            </div>
          </div>

          {pollStatus !== 'connected' && (
            <Button
              variant="outline"
              className="w-full text-gray-500 border-gray-200"
              onClick={onSkip}
            >
              Пропустить и подключить позже
            </Button>
          )}

        </CardContent>
      </Card>
    </div>
  );
}

interface WelcomeContentProps {
  qualificationCompleted: boolean;
  initialResponses: Record<string, unknown>;
  hasOrganizations?: boolean;
  isNewUser?: boolean;
  needsEmailVerification?: boolean;
  isTelegramRegistration?: boolean;
  hasTelegramAccount?: boolean;
}

type WelcomeStep = 'email_verify' | 'telegram_connect' | 'qualification' | 'creating';

export function WelcomeContent({
  qualificationCompleted: initialCompleted,
  initialResponses,
  hasOrganizations = false,
  isNewUser = false,
  needsEmailVerification = false,
  isTelegramRegistration = false,
  hasTelegramAccount = false,
}: WelcomeContentProps) {
  const router = useRouter();
  const [creatingOrg, setCreatingOrg] = useState(false);
  const navigatingRef = useRef(false); // useRef для синхронного guard (useState асинхронен)
  const [welcomeError, setWelcomeError] = useState<string | null>(null);
  const [regMeta, setRegMeta] = useState<{ from_page?: string; utm_campaign?: string } | null>(null);
  // Telegram connect is now a dismissible dialog shown after org creation, not a blocking step
  const [showTelegramDialog, setShowTelegramDialog] = useState(false);
  const shouldOfferTelegram = isNewUser && !isTelegramRegistration && !hasTelegramAccount;

  const getInitialStep = (): WelcomeStep => {
    if (needsEmailVerification) return 'email_verify';
    if (!initialCompleted) return 'qualification';
    return 'creating';
  };

  const [step, setStep] = useState<WelcomeStep>(getInitialStep);

  const goalsSent = useRef(false);
  const metaSent = useRef(false);

  // Log welcome step for funnel tracking
  const logWelcomeEvent = (event: string, extra?: Record<string, unknown>) => {
    fetch('/api/vitals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'welcome_funnel',
        event,
        step,
        is_new_user: isNewUser,
        has_orgs: hasOrganizations,
        ...extra,
      }),
    }).catch(() => {});
  };

  useEffect(() => {
    const meta = getRegistrationMeta();
    if (meta) {
      setRegMeta({ from_page: meta.from_page, utm_campaign: meta.utm_campaign });
    }
  }, []);

  useEffect(() => {
    if (goalsSent.current) return;
    goalsSent.current = true;

    logWelcomeEvent('welcome_page_view', { initial_step: getInitialStep() });
    ymGoal('welcome_page_view', undefined, { once: true });

    if (isNewUser) {
      ymGoal('registration_complete', undefined, { once: true });
    }

    if (isNewUser && isTelegramRegistration) {
      ymGoal('telegram_account_connected', undefined, { once: true });
    }

    ymGoal('auth_success', undefined, { once: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (metaSent.current) return;
    metaSent.current = true;

    const meta = getRegistrationMeta();
    if (meta && Object.keys(meta).length > 0) {
      fetch('/api/user/registration-meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(meta),
      }).then(() => clearRegistrationMeta()).catch(() => {});
    } else if (isNewUser && !isTelegramRegistration) {
      // Fallback: no client-side meta captured (e.g. direct navigation, blocked cookies).
      // Send at least the current page context so the registration isn't completely blank.
      const fallbackMeta: Record<string, string | number | undefined> = {
        landing_page: window.location.pathname,
        device_type: window.innerWidth < 768 ? 'mobile' : window.innerWidth < 1024 ? 'tablet' : 'desktop',
        user_agent: navigator.userAgent,
        screen_width: window.innerWidth,
      };
      // Pick up referrer if available
      if (document.referrer) {
        fallbackMeta.referrer_url = document.referrer;
      }
      fetch('/api/user/registration-meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fallbackMeta),
      }).catch(() => {});
    }
    // Telegram MiniApp registrations already have server-side meta — no fallback needed.
  }, []);

  // Если квалификация уже пройдена, но нет активных организаций —
  // сразу создаём организацию без показа квалификационной формы.
  // Без этого эффекта step='creating' показывает вечный спиннер без действия.
  useEffect(() => {
    if (getInitialStep() === 'creating') {
      autoCreateOrgAndRedirect();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function autoCreateOrgAndRedirect() {
    if (navigatingRef.current) return; // prevent double-clicks (useRef = синхронно)
    navigatingRef.current = true;
    setWelcomeError(null);
    setStep('creating');

    logWelcomeEvent('auto_create_org_start', { has_orgs: hasOrganizations });

    if (hasOrganizations) {
      router.push('/orgs');
      return;
    }

    // Fresh server-side check to handle stale hasOrganizations prop
    try {
      const checkRes = await fetch('/api/user/organizations', {
        signal: AbortSignal.timeout(8000),
      });
      if (checkRes.ok) {
        const { organizations } = await checkRes.json();
        if (organizations && organizations.length > 0) {
          router.push('/orgs');
          return;
        }
      }
    } catch { /* proceed with creation */ }

    setCreatingOrg(true);
    try {
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Моё сообщество' }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json();
      if (res.ok && data.org_id) {
        ymGoal('org_created', { auto: true }, { once: true });
        ymGoal('first_org_created', { auto: true }, { once: true });
        logWelcomeEvent('org_created', { org_id: data.org_id });
        // Show Telegram connect dialog if user hasn't connected yet
        if (shouldOfferTelegram) {
          setCreatingOrg(false);
          setShowTelegramDialog(true);
          return;
        }
        router.push(`/app/${data.org_id}`);
        return;
      }
      // API returned error
      logWelcomeEvent('org_create_error', { status: res.status, error: data.error });
      fetch('/api/vitals', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'welcome_org_create_failed', status: res.status, error: data.error }) }).catch(() => {});
      setWelcomeError('Не удалось создать пространство. Попробуйте ещё раз.');
    } catch (err) {
      const isTimeout = err instanceof DOMException && err.name === 'TimeoutError';
      const errMsg = err instanceof Error ? err.message : String(err);
      logWelcomeEvent('org_create_error', { error: errMsg, is_timeout: isTimeout });
      fetch('/api/vitals', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'welcome_org_create_exception', error: errMsg, is_timeout: isTimeout }) }).catch(() => {});
      setWelcomeError(isTimeout
        ? 'Сервер отвечает медленно. Попробуйте ещё раз.'
        : 'Произошла ошибка. Попробуйте ещё раз.');
    }
    setCreatingOrg(false);
    navigatingRef.current = false;
  }

  const handleEmailVerified = () => {
    if (!initialCompleted) {
      setStep('qualification');
    } else {
      autoCreateOrgAndRedirect();
    }
  };

  const handleTelegramConnected = () => {
    logWelcomeEvent('telegram_connected');
    setShowTelegramDialog(false);
    // Continue to org — already created or redirect to it
    router.push('/orgs');
  };

  const handleTelegramSkipped = () => {
    logWelcomeEvent('telegram_skipped');
    ymGoal('telegram_connect_skipped', undefined, { once: true });
    setShowTelegramDialog(false);
    router.push('/orgs');
  };

  const handleQualificationComplete = (responses: Record<string, unknown>) => {
    logWelcomeEvent('qualification_completed');
    ymGoal('qualification_completed', {
      community_type: responses.community_type,
      pain_points: responses.pain_points,
    }, { once: true });
    autoCreateOrgAndRedirect();
  };

  const handleQualificationSkip = () => {
    logWelcomeEvent('qualification_skipped');
    ymGoal('qualification_skipped', undefined, { once: true });
    autoCreateOrgAndRedirect();
  };

  if (step === 'email_verify') {
    return <EmailVerificationStep onVerified={handleEmailVerified} />;
  }

  if (step === 'qualification' && !navigatingRef.current) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <QualificationForm
          onComplete={handleQualificationComplete}
          onSkip={handleQualificationSkip}
          initialResponses={initialResponses}
          showSkip={true}
        />
      </div>
    );
  }

  // Telegram connect dialog (shown after org creation, dismissible)
  if (showTelegramDialog) {
    return (
      <TelegramConnectStep
        onConnected={handleTelegramConnected}
        onSkip={handleTelegramSkipped}
        fromPage={regMeta?.from_page}
        utmCampaign={regMeta?.utm_campaign}
      />
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="text-center space-y-4">
        {welcomeError ? (
          <>
            <p className="text-red-600 text-sm">{welcomeError}</p>
            <Button
              onClick={() => autoCreateOrgAndRedirect()}
              className="mx-auto"
            >
              Попробовать ещё раз
            </Button>
            <button
              onClick={() => { router.push('/orgs'); }}
              className="text-sm text-gray-500 underline block mx-auto"
            >
              Перейти к списку пространств
            </button>
          </>
        ) : (
          <>
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto" />
            <p className="text-gray-600">
              {creatingOrg ? 'Создаём пространство...' : 'Подготовка...'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
