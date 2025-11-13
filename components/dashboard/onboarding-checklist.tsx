'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface OnboardingStatus {
  hasTelegramAccount: boolean
  hasGroups: boolean
  hasMaterials: boolean
  hasEvents: boolean
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
      label: 'Создана организация',
      completed: true,
      link: null
    },
    {
      id: 'telegram',
      label: 'Привязан Telegram-аккаунт',
      completed: status.hasTelegramAccount,
      link: `/p/${orgId}/telegram/account`,
      action: 'Привязать сейчас'
    },
    {
      id: 'groups',
      label: 'Добавлена первая группа',
      completed: status.hasGroups,
      link: `/p/${orgId}/telegram`,
      action: 'Добавить группу'
    },
    {
      id: 'materials',
      label: 'Создан первый материал',
      completed: status.hasMaterials,
      link: `/p/${orgId}/materials`,
      action: 'Создать материал'
    },
    {
      id: 'events',
      label: 'Запланировано первое событие',
      completed: status.hasEvents,
      link: `/p/${orgId}/events/new`,
      action: 'Создать событие'
    }
  ]

  const completedSteps = steps.filter(s => s.completed).length

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Быстрый старт</CardTitle>
          <span className="text-sm text-neutral-500">
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
      <CardContent className="space-y-3">
        {steps.map((step) => (
          <div
            key={step.id}
            className="flex items-center justify-between p-3 rounded-lg hover:bg-neutral-50 transition-colors"
          >
            <div className="flex items-center gap-3 flex-1">
              <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                step.completed 
                  ? 'bg-green-500 text-white' 
                  : 'bg-neutral-200 text-neutral-400'
              }`}>
                {step.completed ? (
                  <span className="text-sm">✓</span>
                ) : (
                  <span className="text-sm">⬜</span>
                )}
              </div>
              <span className={step.completed ? 'text-neutral-600' : 'text-neutral-900 font-medium'}>
                {step.label}
              </span>
            </div>
            {!step.completed && step.link && (
              <Link href={step.link}>
                <Button variant="outline" className="text-sm">
                  {step.action}
                </Button>
              </Link>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

