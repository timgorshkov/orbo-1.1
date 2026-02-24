'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { QualificationForm } from '@/components/onboarding/qualification-form';
import { Mail, CheckCircle2 } from 'lucide-react';
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
  const [showQualification, setShowQualification] = useState(!initialCompleted || !hasOrganizations);
  const [qualificationDone, setQualificationDone] = useState(initialCompleted);
  const [creatingOrg, setCreatingOrg] = useState(false);
  
  const goalsSent = useRef(false);
  
  useEffect(() => {
    if (goalsSent.current) return;
    goalsSent.current = true;
    
    ymGoal('welcome_page_view', undefined, { once: true });
    
    if (isNewUser) {
      ymGoal('registration_complete', undefined, { once: true });
    }
    
    ymGoal('auth_success', undefined, { once: true });
  }, []);

  async function autoCreateOrgAndRedirect() {
    if (hasOrganizations) {
      router.push('/orgs');
      return;
    }

    setCreatingOrg(true);
    try {
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Моё сообщество' }),
      });
      const data = await res.json();
      if (res.ok && data.org_id) {
        ymGoal('organization_created', { auto: true }, { once: true });
        router.push(`/app/${data.org_id}`);
        return;
      }
    } catch { /* fall through */ }
    setCreatingOrg(false);
    router.push('/orgs');
  }

  const handleQualificationComplete = (responses: Record<string, unknown>) => {
    setQualificationDone(true);
    setShowQualification(false);
    
    ymGoal('qualification_completed', { 
      community_type: responses.community_type,
      pain_points: responses.pain_points,
    }, { once: true });
    
    autoCreateOrgAndRedirect();
  };

  const handleSkip = () => {
    setShowQualification(false);
    
    ymGoal('qualification_skipped', undefined, { once: true });
    
    autoCreateOrgAndRedirect();
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

  // After qualification, auto-create org happens in handleQualificationComplete/handleSkip.
  // Show a loading state while the org is being created.
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

