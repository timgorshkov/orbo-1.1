'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { QualificationForm } from '@/components/onboarding/qualification-form';
import { ArrowRight, MessageSquare, Calendar, BarChart3 } from 'lucide-react';
import { ymGoal } from '@/components/analytics/YandexMetrika';

interface WelcomeContentProps {
  qualificationCompleted: boolean;
  initialResponses: Record<string, unknown>;
  hasOrganizations?: boolean;
  isNewUser?: boolean; // True only when user was just created (not returning user)
}

export function WelcomeContent({ 
  qualificationCompleted: initialCompleted,
  initialResponses,
  hasOrganizations = false,
  isNewUser = false, // Default false - only true for actual new registrations
}: WelcomeContentProps) {
  const router = useRouter();
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
      use_case: responses.use_case,
      group_size: responses.group_size
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

  // Show welcome screen after qualification (only for users without organizations)
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-2xl border-0 shadow-lg">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-3xl mb-2">
            {qualificationDone ? '🎉 Отлично!' : 'Добро пожаловать в Orbo!'}
          </CardTitle>
          <CardDescription className="text-lg">
            Платформа для управления сообществами через Telegram
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-start gap-4 p-4 rounded-lg bg-blue-50/50">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Подключите Telegram-группы</h3>
                <p className="text-sm text-gray-600">
                  Привяжите свои Telegram-группы к пространству и начните управлять участниками
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-lg bg-purple-50/50">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Создавайте события</h3>
                <p className="text-sm text-gray-600">
                  Организуйте мероприятия, регистрируйте участников и отслеживайте активность
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-lg bg-green-50/50">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Анализируйте активность</h3>
                <p className="text-sm text-gray-600">
                  Получайте аналитику по сообщениям, участникам и событиям в вашем сообществе
                </p>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t">
            <p className="text-sm text-gray-600 mb-4 text-center">
              Готовы начать? Создайте своё первое пространство
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
              После создания пространства вы сможете добавить Telegram-группы и начать работу
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

