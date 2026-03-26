'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import ImportHistory from '@/components/telegram/import-history'
import { createClientLogger } from '@/lib/logger'

type TelegramGroup = {
  id: string
  tg_chat_id: string | number
  title: string
  bot_status: string
  member_count: number
  org_id: string
  is_admin: boolean
  is_owner: boolean
  status?: string
  admin_verified?: boolean // Подтверждены ли права админа через Bot API
  // verification_status removed in migration 080
}

export default function AvailableGroupsPage({ params }: { params: { org: string } }) {
  const logger = createClientLogger('AvailableGroupsPage', { org: params.org });
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [availableGroups, setAvailableGroups] = useState<TelegramGroup[]>([])
  const [error, setError] = useState<string | null>(null)
  const [addingGroup, setAddingGroup] = useState<string | null>(null)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [addedGroupId, setAddedGroupId] = useState<string | null>(null)
  const [addedGroupTitle, setAddedGroupTitle] = useState<string | null>(null)
  
  useEffect(() => {
    // Создаем переменную для отслеживания, монтирован ли еще компонент
    let isMounted = true;
    let requestInProgress = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 2;
    
    // ✅ ОПТИМИЗАЦИЯ: Обновляем права админа в ФОНЕ, не блокируя загрузку страницы
    async function updateAdminRightsInBackground() {
      try {
        logger.debug({ org: params.org }, 'Updating admin rights in background');
        const updateRes = await fetch('/api/telegram/groups/update-admin-rights', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            orgId: params.org
          }),
          signal: AbortSignal.timeout(30000) // 30 секунд таймаут для фоновой операции
        });
        
        if (updateRes.ok) {
          const updateData = await updateRes.json();
          logger.debug({
            updated_count: updateData.updatedGroups?.length || 0,
            org: params.org
          }, 'Updated admin rights for groups');
        } else {
          logger.error({ 
            status: updateRes.status,
            org: params.org
          }, 'Failed to update admin rights');
        }
      } catch (e) {
        logger.error({ 
          error: e instanceof Error ? e.message : String(e),
          org: params.org
        }, 'Error updating admin rights');
      }
    }
    
    async function fetchAvailableGroups() {
      if (requestInProgress || attempts >= MAX_ATTEMPTS) return;
      
      requestInProgress = true;
      attempts++;
      setLoading(true)
      setError(null)
      
      try {
        const timestamp = new Date().getTime()
        logger.info({ 
          org: params.org,
          attempt: attempts
        }, 'Fetching available groups');
        const res = await fetch(`/api/telegram/groups/for-user?orgId=${params.org}&includeExisting=true&skipAutoAssign=true&t=${timestamp}`, {
          // Увеличиваем таймаут для запроса - Supabase медленный
          signal: AbortSignal.timeout(20000) // 20 секунд таймаут
        })
        
        // Если компонент был размонтирован во время запроса, прерываем обработку
        if (!isMounted) return;
        
        if (!res.ok) {
          logger.error({ 
            status: res.status,
            status_text: res.statusText,
            org: params.org
          }, 'API response error');
          
          // Пытаемся получить текст ошибки из ответа
          let errorText = `Failed to fetch available groups: ${res.status} ${res.statusText}`
          try {
            const errorData = await res.json()
            if (errorData.error) {
              errorText += ` - ${errorData.error}`
            }
            if (errorData.details) {
              errorText += ` (${errorData.details})`
            }
            logger.error({ 
              error_data: errorData,
              org: params.org
            }, 'API error details');
          } catch (jsonError) {
            logger.error({ 
              error: jsonError instanceof Error ? jsonError.message : String(jsonError),
              org: params.org
            }, 'Failed to parse error response');
          }
          
          throw new Error(errorText)
        }
        
        const data = await res.json()
        
        // Если компонент был размонтирован во время запроса, прерываем обработку
        if (!isMounted) return;
        
        logger.debug({ 
          org: params.org,
          has_groups: !!data.availableGroups
        }, 'API response received');
        
        if (data.availableGroups) {
          setAvailableGroups(data.availableGroups)
          logger.debug({ 
            org: params.org,
            group_count: data.availableGroups.length
          }, 'Loaded available groups');
        } else {
          logger.debug({ org: params.org }, 'No available groups in response');
          setAvailableGroups([])
        }
      } catch (e: any) {
        // Если компонент был размонтирован во время запроса, прерываем обработку
        if (!isMounted) return;
        
        // Определяем тип ошибки для лучшего UX
        let errorMessage = e.message || 'Failed to fetch available groups';
        let isTimeout = false;
        
        if (e.name === 'TimeoutError' || e.message?.includes('timeout') || e.message?.includes('signal')) {
          isTimeout = true;
          errorMessage = 'Сервер не ответил вовремя. Пожалуйста, обновите страницу или попробуйте позже.';
        } else if (e.message?.includes('502') || e.message?.includes('503')) {
          errorMessage = 'Сервер временно недоступен. Попробуйте обновить страницу через несколько секунд.';
        }
        
        logger.error({ 
          error: e.message,
          error_name: e.name,
          is_timeout: isTimeout,
          attempt: attempts,
          org: params.org
        }, 'Error fetching available groups');
        setError(errorMessage)
      } finally {
        requestInProgress = false;
        if (isMounted) {
          setLoading(false)
        }
      }
    }
    
    // ✅ ОПТИМИЗАЦИЯ: Сначала показываем доступные группы (быстро)
    fetchAvailableGroups();
    
    // ✅ Затем обновляем права админа в ФОНЕ (медленно, но не блокирует UI)
    updateAdminRightsInBackground();
    
    // Функция очистки для избежания утечек памяти и обновлений состояния после размонтирования
    return () => {
      isMounted = false;
    }
  }, [params.org])
  
  const addGroupToOrg = async (groupId: string) => {
    setAddingGroup(groupId)
    setError(null)
    
    try {
      logger.info({ 
        org: params.org,
        group_id: groupId
      }, 'Adding group to org');
      const res = await fetch('/api/telegram/groups/add-to-org', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          groupId,
          orgId: params.org
        })
      })
      
      const data = await res.json()
      logger.debug({ 
        org: params.org,
        group_id: groupId,
        suggest_import: data.suggestImport
      }, 'Add group response');
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to add group to organization')
      }
      
      logger.info({ 
        org: params.org,
        group_id: groupId
      }, 'Successfully added group, refreshing page');
      
      // Обновляем список доступных групп (удаляем добавленную группу)
      setAvailableGroups(availableGroups.filter(group => group.id !== groupId))
      
      // Обновляем данные на странице
      router.refresh()
      
      // ✅ Если API вернул флаг suggestImport - показываем модальное окно с предложением импорта
      if (data.suggestImport) {
        const addedGroup = availableGroups.find(g => g.id === groupId)
        setAddedGroupId(groupId)
        setAddedGroupTitle(addedGroup?.title || null)
        setShowImportDialog(true)
      } else {
        // Показываем сообщение об успехе и перенаправляем
        alert('Группа успешно добавлена в организацию!')
        setTimeout(() => {
          router.push(`/app/${params.org}/telegram`)
        }, 500)
      }
    } catch (e: any) {
      logger.error({ 
        error: e.message,
        stack: e.stack,
        org: params.org,
        group_id: groupId
      }, 'Error adding group to organization');
      setError(e.message || 'Failed to add group to organization')
    } finally {
      setAddingGroup(null)
    }
  }
  
  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          Доступные Telegram группы
        </h1>
        <Button variant="outline" onClick={() => router.push(`/app/${params.org}/telegram`)}>
          Назад к Telegram
        </Button>
      </div>
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded mb-6">
          {error}
        </div>
      )}
      
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-neutral-600 font-medium mb-2">Сканирование Telegram групп...</p>
          <p className="text-sm text-neutral-500">
            Проверяем ваши права администратора через Telegram Bot API
          </p>
        </div>
      ) : availableGroups.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {availableGroups.map(group => (
            <Card key={group.id}>
              <CardHeader>
                <CardTitle className="text-lg">{group.title}</CardTitle>
                <CardDescription>
                  ID: {group.tg_chat_id}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-neutral-600">Участников:</span>
                    <span className="font-medium">{group.member_count || 'Неизвестно'}</span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-neutral-600">Статус бота:</span>
                    <span className={`font-medium ${
                      group.bot_status === 'connected' ? 'text-green-600' : 
                      group.bot_status === 'pending' ? 'text-amber-600' : 
                      'text-red-600'
                    }`}>
                      {group.bot_status === 'connected' ? 'Подключен' : 
                       group.bot_status === 'pending' ? 'Ожидает' : 
                       'Неактивен'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-neutral-600">Ваши права:</span>
                    <span className="font-medium">
                      {group.is_owner ? 'Владелец' : group.is_admin ? 'Админ' : 'Нет'}
                    </span>
                  </div>
                  {group.status === 'archived' && (
                    <p className="mt-3 text-sm text-amber-600">
                      Эта группа ранее была удалена из организации. Добавление заново восстановит связь.
                    </p>
                  )}
                  
                  {/* ⚠️ НОВОЕ: Предупреждение для групп без подтвержденных прав админа */}
                  {group.admin_verified === false && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded">
                      <p className="text-sm text-amber-800 font-medium mb-1">
                        ⚠️ Требуются права администратора
                      </p>
                      <p className="text-xs text-amber-700">
                        Выдайте боту <strong>@orbo_community_bot</strong> права администратора в этой группе,
                        затем отправьте любое сообщение и обновите страницу.
                      </p>
                      <p className="text-xs text-amber-600 mt-1">
                        Достаточно выдать только три права: <strong>удаление сообщений</strong>, <strong>блокировка пользователей</strong> и <strong>пригласительные ссылки</strong>.
                      </p>
                    </div>
                  )}
                </div>
                
                <Button 
                  variant={group.status === 'archived' ? 'outline' : 'default'}
                  onClick={() => addGroupToOrg(group.id)} 
                  className="w-full"
                  disabled={addingGroup === group.id || group.admin_verified === false}
                >
                  {addingGroup === group.id ? 'Добавление...' : 
                   group.admin_verified === false ? 'Выдайте права администратора' :
                   'Добавить в организацию'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-4">
              Как подключить Telegram-группу
            </h3>
            <ol className="space-y-3 text-blue-800">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center">1</span>
                <div>
                  <p className="font-medium">Добавьте бота в группу</p>
                  <p className="text-sm mt-0.5">Откройте вашу группу в Telegram, добавьте участника <code className="bg-blue-100 px-1.5 py-0.5 rounded font-mono">@orbo_community_bot</code> и назначьте его <strong>администратором</strong>.</p>
                  <p className="text-sm text-blue-600 mt-1">Достаточно трёх прав: удаление сообщений, блокировка пользователей, пригласительные ссылки.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center">2</span>
                <div>
                  <p className="font-medium">Отправьте сообщение в группу</p>
                  <p className="text-sm mt-0.5">Напишите любое сообщение в группу, чтобы бот зафиксировал вас как администратора.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center">3</span>
                <div>
                  <p className="font-medium">Обновите страницу</p>
                  <p className="text-sm mt-0.5">Через 5–10 секунд нажмите кнопку ниже — группа появится в списке.</p>
                </div>
              </li>
            </ol>
            <button
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Обновить список групп
            </button>
          </div>
        </div>
      )}

      {/* ✅ Модальное окно с предложением импорта истории */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {addedGroupTitle
                ? `«${addedGroupTitle}» подключена — восстановите базу участников`
                : 'Группа подключена — восстановите базу участников'}
            </DialogTitle>
            <DialogDescription>
              Бот фиксирует только тех, кто написал после подключения — обычно 5–30 человек. Загрузите экспорт, чтобы восстановить всю историческую базу.
            </DialogDescription>

            <div className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
              <p className="font-semibold mb-1">Почему сейчас видно мало участников?</p>
              <p>
                Бот фиксирует только тех, кто написал в группе <strong>после его подключения</strong>.
                Обычно это 5–30 человек. Чтобы увидеть всю историческую базу — загрузите экспорт переписки.
              </p>
            </div>

            <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900">
              <p className="font-semibold mb-2">Как экспортировать историю из Telegram:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Откройте группу в <strong>Telegram Desktop</strong> (не в телефоне)</li>
                <li>Нажмите <strong>⋯ → Экспорт истории чата</strong></li>
                <li>Выберите формат <strong>JSON</strong> (рекомендуется — точнее распознаёт участников)</li>
                <li>Снимите галочки с медиа — они не нужны, файл будет меньше</li>
                <li>Нажмите «Экспорт» и загрузите полученный файл ниже</li>
              </ol>
            </div>
          </DialogHeader>

          {addedGroupId && (
            <div className="mt-4">
              <ImportHistory
                groupId={addedGroupId}
                orgId={params.org}
                simplified={true}
                onImportSuccess={() => {
                  setShowImportDialog(false)
                  setTimeout(() => {
                    router.push(`/app/${params.org}/telegram`)
                  }, 500)
                }}
              />
            </div>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowImportDialog(false)
                setTimeout(() => {
                  router.push(`/app/${params.org}/telegram`)
                }, 300)
              }}
            >
              Пропустить — загружу позже
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
