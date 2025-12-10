import { requireOrgAccess } from '@/lib/orgGuard'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TabsLayout from '../tabs-layout'
import { Upload, MessageSquare, Users, FileText, Clock } from 'lucide-react'

export default async function WhatsAppPage({ params }: { params: Promise<{ org: string }> }) {
  try {
    const { org: orgId } = await params
    const { supabase, role } = await requireOrgAccess(orgId)
    
    // Получаем историю импортов (пока заглушка)
    // В будущем: const { data: imports } = await supabase.from('whatsapp_imports')...
    const imports: any[] = []
    
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Настройки мессенджеров</h1>
        </div>
        
        <TabsLayout orgId={orgId}>
          <div className="grid gap-6">
            {/* Карточка импорта */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="w-5 h-5" />
                  Импорт истории WhatsApp
                </CardTitle>
                <CardDescription>
                  Импортируйте историю сообщений из групповых чатов WhatsApp для добавления участников и их активности в сообщество
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="font-medium text-green-900 mb-3">📱 Как экспортировать историю чата:</h4>
                  <ol className="text-sm text-green-800 space-y-2 list-decimal list-inside">
                    <li>Откройте групповой чат в WhatsApp</li>
                    <li>Нажмите <strong>⋮</strong> → <strong>Ещё</strong> → <strong>Экспорт чата</strong></li>
                    <li>Выберите <strong>"Без медиа"</strong> для быстрого экспорта</li>
                    <li>Сохраните файл .txt и загрузите его ниже</li>
                  </ol>
                </div>
                
                <Link 
                  href={`/p/${orgId}/telegram/whatsapp/import`}
                  className="inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-medium bg-green-600 text-white hover:bg-green-700 gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Начать импорт
                </Link>
              </CardContent>
            </Card>
            
            {/* Статистика */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <FileText className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{imports.length}</div>
                      <div className="text-sm text-neutral-500">Импортов</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Users className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">0</div>
                      <div className="text-sm text-neutral-500">Участников добавлено</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <MessageSquare className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">0</div>
                      <div className="text-sm text-neutral-500">Сообщений импортировано</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            {/* История импортов */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  История импортов
                </CardTitle>
              </CardHeader>
              <CardContent>
                {imports.length === 0 ? (
                  <div className="text-center py-8 text-neutral-500">
                    <MessageSquare className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
                    <p>Пока нет импортов</p>
                    <p className="text-sm">Импортируйте первую историю чата, чтобы начать</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Список импортов будет здесь */}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsLayout>
      </div>
    )
  } catch (error) {
    console.error('WhatsApp page error:', error)
    return notFound()
  }
}

