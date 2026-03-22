'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { QualificationForm } from '@/components/onboarding/qualification-form';
import { Mail, CheckCircle2, Send, Users, Shield, ArrowRight } from 'lucide-react';
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
  const [checking, setChecking] = useState(false);
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_REGISTRATION_BOT_USERNAME || 'orbo_start_bot';
  const ctx = getContextMessage(fromPage, utmCampaign);

  const handleCheckConnection = async () => {
    setChecking(true);
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
    setChecking(false);
  };

  useEffect(() => {
    handleCheckConnection();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-lg border-0 shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
            <Send className="w-8 h-8 text-blue-600" />
          </div>
          <CardTitle className="text-xl leading-snug">{ctx.headline}</CardTitle>
          <CardDescription className="text-base mt-2">
            {ctx.subtitle}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-3">
            <div className="flex items-start gap-3 text-sm text-gray-600">
              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-bold text-blue-600">1</span>
              </div>
              <span>Откройте бота <a href={`https://t.me/${botUsername}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 font-medium hover:underline">@{botUsername}</a> в Telegram и нажмите Start</span>
            </div>
            <div className="flex items-start gap-3 text-sm text-gray-600">
              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-bold text-blue-600">2</span>
              </div>
              <span>Бот пришлёт код подтверждения</span>
            </div>
            <div className="flex items-start gap-3 text-sm text-gray-600">
              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-bold text-blue-600">3</span>
              </div>
              <span>Вернитесь сюда и нажмите «Проверить подключение»</span>
            </div>
          </div>

          <a
            href={`https://t.me/${botUsername}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 w-full h-12 rounded-xl bg-[#2AABEE] hover:bg-[#229ED9] text-white font-semibold transition-colors"
          >
            <Send className="w-5 h-5" />
            {ctx.ctaLabel}
          </a>

          <Button
            variant="outline"
            className="w-full h-11"
            onClick={handleCheckConnection}
            disabled={checking}
          >
            {checking ? 'Проверяем...' : 'Проверить подключение'}
          </Button>

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

          <button
            onClick={onSkip}
            className="w-full text-center text-sm text-gray-400 hover:text-gray-600 transition-colors pt-1"
          >
            Пропустить и подключить позже
          </button>
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
  const [regMeta, setRegMeta] = useState<{ from_page?: string; utm_campaign?: string } | null>(null);

  const getInitialStep = (): WelcomeStep => {
    if (needsEmailVerification) return 'email_verify';
    if (!hasTelegramAccount && !isTelegramRegistration) return 'telegram_connect';
    if (!initialCompleted) return 'qualification';
    return 'creating';
  };

  const [step, setStep] = useState<WelcomeStep>(getInitialStep);

  const goalsSent = useRef(false);
  const metaSent = useRef(false);

  useEffect(() => {
    const meta = getRegistrationMeta();
    if (meta) {
      setRegMeta({ from_page: meta.from_page, utm_campaign: meta.utm_campaign });
    }
  }, []);

  useEffect(() => {
    if (goalsSent.current) return;
    goalsSent.current = true;

    ymGoal('welcome_page_view', undefined, { once: true });

    if (isNewUser) {
      ymGoal('registration_complete', undefined, { once: true });
    }

    if (isNewUser && isTelegramRegistration) {
      ymGoal('telegram_account_connected', undefined, { once: true });
    }

    ymGoal('auth_success', undefined, { once: true });
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
    }
  }, []);

  async function autoCreateOrgAndRedirect() {
    if (hasOrganizations) {
      router.push('/orgs');
      return;
    }

    setCreatingOrg(true);
    setStep('creating');
    try {
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Моё сообщество' }),
      });
      const data = await res.json();
      if (res.ok && data.org_id) {
        ymGoal('org_created', { auto: true }, { once: true });
        ymGoal('first_org_created', { auto: true }, { once: true });
        router.push(`/app/${data.org_id}`);
        return;
      }
    } catch { /* fall through */ }
    setCreatingOrg(false);
    router.push('/orgs');
  }

  const handleEmailVerified = () => {
    if (!hasTelegramAccount && !isTelegramRegistration) {
      setStep('telegram_connect');
    } else if (!initialCompleted) {
      setStep('qualification');
    } else {
      autoCreateOrgAndRedirect();
    }
  };

  const handleTelegramConnected = () => {
    if (!initialCompleted) {
      setStep('qualification');
    } else {
      autoCreateOrgAndRedirect();
    }
  };

  const handleTelegramSkipped = () => {
    ymGoal('telegram_connect_skipped', undefined, { once: true });
    if (!initialCompleted) {
      setStep('qualification');
    } else {
      autoCreateOrgAndRedirect();
    }
  };

  const handleQualificationComplete = (responses: Record<string, unknown>) => {
    ymGoal('qualification_completed', {
      community_type: responses.community_type,
      pain_points: responses.pain_points,
    }, { once: true });
    autoCreateOrgAndRedirect();
  };

  const handleQualificationSkip = () => {
    ymGoal('qualification_skipped', undefined, { once: true });
    autoCreateOrgAndRedirect();
  };

  if (step === 'email_verify') {
    return <EmailVerificationStep onVerified={handleEmailVerified} />;
  }

  if (step === 'telegram_connect') {
    return (
      <TelegramConnectStep
        onConnected={handleTelegramConnected}
        onSkip={handleTelegramSkipped}
        fromPage={regMeta?.from_page}
        utmCampaign={regMeta?.utm_campaign}
      />
    );
  }

  if (step === 'qualification') {
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="text-center space-y-4">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto" />
        <p className="text-gray-600">
          {creatingOrg ? 'Создаём пространство...' : 'Подготовка...'}
        </p>
      </div>
    </div>
  );
}
