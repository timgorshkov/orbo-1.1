'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

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
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [availableGroups, setAvailableGroups] = useState<TelegramGroup[]>([])
  const [error, setError] = useState<string | null>(null)
  const [addingGroup, setAddingGroup] = useState<string | null>(null)
  
  useEffect(() => {
    // Создаем переменную для отслеживания, монтирован ли еще компонент
    let isMounted = true;
    let requestInProgress = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 2;
    
    async function updateAdminRights() {
      try {
        console.log('Updating admin rights before fetching available groups...');
        const updateRes = await fetch('/api/telegram/groups/update-admin-rights', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            orgId: params.org
          }),
          signal: AbortSignal.timeout(15000) // 15 секунд таймаут
        });
        
        if (!isMounted) return;
        
        if (updateRes.ok) {
          const updateData = await updateRes.json();
          console.log(`Updated admin rights for ${updateData.updatedGroups?.length || 0} groups`);
        } else {
          console.error(`Failed to update admin rights: ${updateRes.status} ${updateRes.statusText}`);
        }
      } catch (e) {
        console.error('Error updating admin rights:', e);
      }
      
      // Продолжаем с получением доступных групп независимо от результата обновления прав
      fetchAvailableGroups();
    }
    
    async function fetchAvailableGroups() {
      if (requestInProgress || attempts >= MAX_ATTEMPTS) return;
      
      requestInProgress = true;
      attempts++;
      setLoading(true)
      setError(null)
      
      try {
        const timestamp = new Date().getTime()
        console.log(`Fetching available groups for org ${params.org}... (attempt ${attempts})`)
        const res = await fetch(`/api/telegram/groups/for-user?orgId=${params.org}&includeExisting=true&skipAutoAssign=true&t=${timestamp}`, {
          // Увеличиваем таймаут для запроса
          signal: AbortSignal.timeout(10000) // 10 секунд таймаут
        })
        
        // Если компонент был размонтирован во время запроса, прерываем обработку
        if (!isMounted) return;
        
        if (!res.ok) {
          console.error(`API response status: ${res.status} ${res.statusText}`)
          
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
            console.error('API error details:', errorData)
          } catch (jsonError) {
            console.error('Failed to parse error response:', jsonError)
          }
          
          throw new Error(errorText)
        }
        
        const data = await res.json()
        
        // Если компонент был размонтирован во время запроса, прерываем обработку
        if (!isMounted) return;
        
        console.log('API response:', data)
        
        if (data.availableGroups) {
          setAvailableGroups(data.availableGroups)
          console.log(`Loaded ${data.availableGroups.length} available groups`)
        } else {
          console.log('No available groups in response')
          setAvailableGroups([])
        }
      } catch (e: any) {
        // Если компонент был размонтирован во время запроса, прерываем обработку
        if (!isMounted) return;
        
        console.error('Error fetching available groups:', e)
        setError(e.message || 'Failed to fetch available groups')
      } finally {
        requestInProgress = false;
        if (isMounted) {
          setLoading(false)
        }
      }
    }
    
    // Сначала обновляем права администратора, затем получаем доступные группы
    updateAdminRights();
    
    // Функция очистки для избежания утечек памяти и обновлений состояния после размонтирования
    return () => {
      isMounted = false;
    }
  }, [params.org])
  
  const addGroupToOrg = async (groupId: string) => {
    setAddingGroup(groupId)
    setError(null)
    
    try {
      console.log(`Adding group ${groupId} to org ${params.org}`)
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
      console.log('Add group response:', data)
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to add group to organization')
      }
      
      console.log(`Successfully added group ${groupId}. Refreshing page...`)
      
      // Обновляем список доступных групп (удаляем добавленную группу)
      setAvailableGroups(availableGroups.filter(group => group.id !== groupId))
      
      // Обновляем данные на странице
      router.refresh()
      
      // Показываем сообщение об успехе
      alert('Группа успешно добавлена в организацию!')
      
      // Перенаправляем на страницу Telegram
      setTimeout(() => {
        router.push(`/app/${params.org}/telegram`)
      }, 500)
    } catch (e: any) {
      console.error('Error adding group to organization:', e)
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
        <div className="max-w-2xl mx-auto">
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6 mb-6">
            <div className="flex items-start gap-4">
              <div className="text-3xl">📢</div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-blue-900 mb-3">
                  Нет доступных групп?
                </h3>
                <p className="text-blue-800 mb-4">
                  Чтобы система обнаружила ваши группы, где добавлен <strong>@orbo_community_bot</strong>:
                </p>
                <ol className="list-decimal list-inside space-y-2 text-blue-800 mb-4">
                  <li>Откройте группу в Telegram</li>
                  <li>Отправьте любое сообщение (например: <code className="bg-blue-100 px-2 py-1 rounded">/start</code>)</li>
                  <li>Обновите эту страницу через 5-10 секунд</li>
                </ol>
                <div className="bg-blue-100 rounded p-3 text-sm text-blue-900">
                  <strong>Важно:</strong> Вы должны быть администратором группы, и бот должен быть добавлен с правами администратора.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
