'use client'

import { Card, CardContent } from '@/components/ui/card'

export default function WelcomeBlock({ orgName }: { orgName: string }) {
  return (
    <Card className="border-0 bg-gradient-to-br from-blue-50 to-purple-50">
      <CardContent className="pt-8 pb-8">
        <h1 className="text-3xl font-bold text-neutral-900 mb-3">
          Добро пожаловать в {orgName}
        </h1>
        <p className="text-lg text-neutral-700 mb-6">
          Собирайте людей на мероприятия и управляйте сообществом без ручной рутины
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-neutral-900 mb-1">Мероприятия в 1 клик</h3>
              <p className="text-sm text-neutral-600">
                Создавайте события, собирайте регистрации и оплаты через Telegram miniapp
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-neutral-900 mb-1">База участников</h3>
              <p className="text-sm text-neutral-600">
                Карточки участников с историей событий и активности
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
              <h3 className="font-semibold text-neutral-900 mb-1">Аналитика и уведомления</h3>
              <p className="text-sm text-neutral-600">
                Следите за вовлечённостью, доходимостью и ростом сообщества
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
