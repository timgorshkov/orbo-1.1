'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface OnboardingStatus {
  hasTelegramAccount: boolean
  hasGroups: boolean
  hasEvents: boolean
  hasSharedEvent: boolean
  assistBotStarted?: boolean
  progress: number
}

interface OnboardingChecklistProps {
  orgId: string
  status: OnboardingStatus
}

export default function OnboardingChecklist({ orgId, status }: OnboardingChecklistProps) {
  const steps = [
    {
      id: 'org',
      label: 'Организация создана',
      description: 'Ваше пространство для управления сообществом готово',
      completed: true,
      link: null,
      action: null
    },
    {
      id: 'events',
      label: 'Создайте первое событие',
      description: 'Встреча, вебинар или любая активность — за пару минут',
      completed: status.hasEvents,
      link: `/p/${orgId}/events/new`,
      action: 'Создать событие'
    },
    {
      id: 'telegram',
      label: 'Привяжите Telegram-аккаунт',
      description: 'Для отправки уведомлений и анонсов участникам',
      completed: status.hasTelegramAccount,
      link: `/p/${orgId}/telegram/account`,
      action: 'Привязать'
    },
    {
      id: 'assist_bot',
      label: 'Запустите бота уведомлений',
      description: 'Бот @orbo_assistant_bot будет присылать вам уведомления в Telegram',
      completed: !!status.assistBotStarted,
      link: 'https://t.me/orbo_assistant_bot',
      action: 'Запустить',
      external: true
    },
    {
      id: 'share',
      label: 'Поделитесь событием',
      description: 'Отправьте ссылку на miniapp или веб-страницу события участникам',
      completed: status.hasSharedEvent,
      link: status.hasEvents ? `/p/${orgId}/events` : null,
      action: status.hasEvents ? 'К событиям' : null
    },
    {
      id: 'groups',
      label: 'Подключите Telegram-группу',
      description: 'Бот будет отслеживать активность и помогать с модерацией',
      completed: status.hasGroups,
      link: `/p/${orgId}/telegram`,
      action: 'Подключить'
    }
  ]

  const completedSteps = steps.filter(s => s.completed).length

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Быстрый старт</CardTitle>
            <p className="text-sm text-neutral-500 mt-1">
              Выполните шаги, чтобы начать собирать людей на мероприятия
            </p>
          </div>
          <span className="text-sm font-medium text-neutral-500">
            {completedSteps} из {steps.length}
          </span>
        </div>
        {/* Progress bar */}
        <div className="mt-4 bg-neutral-100 rounded-full h-2 overflow-hidden">
          <div 
            className="bg-gradient-to-r from-blue-500 to-purple-500 h-full transition-all duration-500"
            style={{ width: `${status.progress}%` }}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
              step.completed ? 'bg-green-50/50' : 'hover:bg-neutral-50'
            }`}
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium ${
                step.completed 
                  ? 'bg-green-500 text-white' 
                  : 'bg-neutral-200 text-neutral-500'
              }`}>
                {step.completed ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              <div className="min-w-0">
                <span className={`block ${step.completed ? 'text-neutral-500 line-through' : 'text-neutral-900 font-medium'}`}>
                  {step.label}
                </span>
                {!step.completed && step.description && (
                  <span className="block text-xs text-neutral-500 mt-0.5 truncate">
                    {step.description}
                  </span>
                )}
              </div>
            </div>
            {!step.completed && step.link && step.action && (
              step.external ? (
                <a href={step.link} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 ml-3">
                  <Button variant="outline" size="sm" className="text-sm whitespace-nowrap">
                    {step.action}
                  </Button>
                </a>
              ) : (
                <Link href={step.link} className="flex-shrink-0 ml-3">
                  <Button variant="outline" size="sm" className="text-sm whitespace-nowrap">
                    {step.action}
                  </Button>
                </Link>
              )
            )}
          </div>
        ))}

        {completedSteps === steps.length && (
          <div className="mt-4 p-4 bg-green-50 rounded-lg text-center">
            <p className="text-green-800 font-medium">Все готово! Дашборд скоро обновится с аналитикой.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
