'use client'

import { Card, CardContent } from '@/components/ui/card'

export default function WelcomeBlock({ orgName }: { orgName: string }) {
  return (
    <Card className="border-0 bg-gradient-to-br from-blue-50 to-purple-50">
      <CardContent className="pt-8 pb-8">
        <h1 className="text-3xl font-bold text-neutral-900 mb-4">
          Добро пожаловать в {orgName}
        </h1>
        <p className="text-lg text-neutral-700 mb-6">
          Управляйте вашим сообществом как профессионал
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-neutral-900 mb-1">Автоматизация</h3>
              <p className="text-sm text-neutral-600">
                Синхронизация участников и активности из Telegram
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-neutral-900 mb-1">Аналитика</h3>
              <p className="text-sm text-neutral-600">
                Отслеживайте вовлеченность и рост сообщества
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-neutral-900 mb-1">События</h3>
              <p className="text-sm text-neutral-600">
                Организуйте мероприятия и отслеживайте регистрации
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

