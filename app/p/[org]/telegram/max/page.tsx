import { requireOrgAccess } from '@/lib/orgGuard'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { notFound } from 'next/navigation'
import TabsLayout from '../tabs-layout'
import { MessageCircle, Zap, Calendar } from 'lucide-react'

export default async function MaxPage({ params }: { params: Promise<{ org: string }> }) {
  try {
    const { org: orgId } = await params
    await requireOrgAccess(orgId)
    
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Настройки мессенджеров</h1>
        </div>
        
        <TabsLayout orgId={orgId}>
          <div className="grid gap-6">
            {/* Карточка "Скоро" */}
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-blue-500" />
                  Интеграция с MAX
                </CardTitle>
                <CardDescription>
                  Российский мессенджер с полноценным Bot API
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
                    <Calendar className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-blue-900 mb-2">
                    Скоро
                  </h3>
                  <p className="text-blue-700 mb-4">
                    Интеграция с мессенджером MAX появится в ближайших обновлениях
                  </p>
                  <div className="text-sm text-blue-600">
                    Ожидаемый срок: Q1 2025
                  </div>
                </div>
                
                <div className="mt-6 space-y-3">
                  <h4 className="font-medium text-neutral-900">Планируемый функционал:</h4>
                  <ul className="space-y-2 text-sm text-neutral-600">
                    <li className="flex items-start gap-2">
                      <Zap className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <span>Подключение MAX-групп к организации</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Zap className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <span>Автоматический сбор сообщений через webhook</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Zap className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <span>Импорт истории сообщений через API</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Zap className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <span>Аналитика активности участников</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Zap className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <span>Публикация событий в MAX-группы</span>
                    </li>
                  </ul>
                </div>
                
                <div className="mt-6 pt-4 border-t">
                  <a 
                    href="https://dev.max.ru/docs" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    Документация MAX для разработчиков →
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsLayout>
      </div>
    )
  } catch (error) {
    console.error('Max page error:', error)
    return notFound()
  }
}

