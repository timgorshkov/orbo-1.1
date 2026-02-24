'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { QualificationForm } from '@/components/onboarding/qualification-form';
import { ArrowRight, MessageSquare, Calendar, BarChart3, Mail, CheckCircle2 } from 'lucide-react';
import { ymGoal } from '@/components/analytics/YandexMetrika';

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

interface WelcomeContentProps {
  qualificationCompleted: boolean;
  initialResponses: Record<string, unknown>;
  hasOrganizations?: boolean;
  isNewUser?: boolean;
  needsEmailVerification?: boolean;
}

export function WelcomeContent({ 
  qualificationCompleted: initialCompleted,
  initialResponses,
  hasOrganizations = false,
  isNewUser = false,
  needsEmailVerification = false,
}: WelcomeContentProps) {
  const router = useRouter();
  const [emailVerified, setEmailVerified] = useState(!needsEmailVerification);
  const [showQualification, setShowQualification] = useState(!initialCompleted);
  const [qualificationDone, setQualificationDone] = useState(initialCompleted);
  
  // Prevent duplicate goal sends (React StrictMode, re-renders)
  const goalsSent = useRef(false);
  
  // Track welcome page view and registration/auth success - ONCE only
  useEffect(() => {
    if (goalsSent.current) return;
    goalsSent.current = true;
    
    ymGoal('welcome_page_view', undefined, { once: true });
    
    // Key conversion: new user registration - ONLY for actually new users
    // This is determined by ?new=1 URL param or created_at < 5 minutes
    if (isNewUser) {
      ymGoal('registration_complete', undefined, { once: true }); // New user registered successfully
    }
    
    // Auth success for both new and returning users
    ymGoal('auth_success', undefined, { once: true });
  }, []); // Empty deps - run only once on mount

  const handleQualificationComplete = (responses: Record<string, unknown>) => {
    setQualificationDone(true);
    setShowQualification(false);
    
    // Track qualification completion (once per session)
    ymGoal('qualification_completed', { 
      community_type: responses.community_type,
      pain_points: responses.pain_points,
    }, { once: true });
    
    // Если у пользователя есть организации — редирект на /orgs
    if (hasOrganizations) {
      router.push('/orgs');
    }
  };

  const handleSkip = () => {
    setShowQualification(false);
    
    // Track qualification skip (once per session)
    ymGoal('qualification_skipped', undefined, { once: true });
    
    // Если у пользователя есть организации — редирект на /orgs
    if (hasOrganizations) {
      router.push('/orgs');
    }
  };

  // Show email verification step for TG-registered users
  if (!emailVerified) {
    return <EmailVerificationStep onVerified={() => setEmailVerified(true)} />;
  }

  // Show qualification form if not completed
  if (showQualification) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <QualificationForm
          onComplete={handleQualificationComplete}
          onSkip={handleSkip}
          initialResponses={initialResponses}
          showSkip={true}
        />
      </div>
    );
  }

  // Determine personalized content based on qualification responses
  const communityType = initialResponses.community_type as string;
  const painPoints = initialResponses.pain_points as string[];
  
  // Check if user needs events-first onboarding
  const isEventsFocused = 
    communityType === 'business_club' || 
    communityType === 'education' ||
    communityType === 'local_hub' ||
    painPoints?.includes('low_attendance') ||
    painPoints?.includes('event_registration');
  
  // Check if user is channel author
  const isChannelAuthor = 
    communityType === 'expert_brand' || 
    communityType === 'channel_author' ||
    painPoints?.includes('no_subscriber_data');

  // Show welcome screen after qualification (only for users without organizations)
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-2xl border-0 shadow-lg">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-3xl mb-2">
            {qualificationDone ? '🎉 Всё готово!' : 'Добро пожаловать в Orbo!'}
          </CardTitle>
          <CardDescription className="text-lg">
            Через пару минут вы будете знать своих участников и управлять событиями
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            {/* Default: Events first */}
            <div className="flex items-start gap-4 p-4 rounded-lg bg-purple-50/50">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">
                  {isEventsFocused 
                    ? 'Создайте первое событие' 
                    : 'Проведите событие'}
                </h3>
                <p className="text-sm text-gray-600">
                  {isEventsFocused
                    ? 'Регистрация и напоминания заработают автоматически. Доходимость повысится.'
                    : 'Регистрация прямо в Telegram, автоматические напоминания и сбор контактов'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-lg bg-blue-50/50">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">
                  {isChannelAuthor 
                    ? 'Подключите канал' 
                    : 'Подключите группу'}
                </h3>
                <p className="text-sm text-gray-600">
                  {isChannelAuthor
                    ? 'Комментаторы канала станут карточками участников с историей активности'
                    : 'Участники появятся автоматически, карточки с историей и контактами'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-lg bg-green-50/50">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">
                  {isEventsFocused
                    ? 'Видите, кто реально ходит'
                    : 'Карточки участников'}
                </h3>
                <p className="text-sm text-gray-600">
                  {isEventsFocused
                    ? 'История посещений, статусы оплат, ценность каждого участника'
                    : 'История активности, посещённые события, интересы и контакты'}
                </p>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t">
            <p className="text-sm text-gray-600 mb-4 text-center">
              Начните с создания пространства для вашего сообщества
            </p>
            <div className="flex gap-3">
              <Button
                asChild
                className="flex-1"
                size="lg"
              >
                <Link href="/orgs/new">
                  Создать пространство
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
            </div>
            <p className="text-xs text-gray-500 text-center mt-3">
              {isEventsFocused
                ? 'Создайте событие, поделитесь ссылкой и получите первые регистрации'
                : 'Подключите группы и начните работу с участниками'}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

