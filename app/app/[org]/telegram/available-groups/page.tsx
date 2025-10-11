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
        <div className="text-center py-8">Загрузка...</div>
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
                </div>
                
                <Button 
                  variant={group.status === 'archived' ? 'outline' : 'default'}
                  onClick={() => addGroupToOrg(group.id)} 
                  className="w-full"
                  disabled={addingGroup === group.id}
                >
                  {addingGroup === group.id ? 'Добавление...' : 'Добавить в организацию'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-neutral-600 mb-4">
            У вас нет доступных Telegram групп, которые можно добавить в эту организацию.
          </p>
          <p className="text-sm text-neutral-500">
            Чтобы добавить группу, вы должны быть администратором группы, и бот @orbo_community_bot должен быть добавлен в группу с правами администратора.
          </p>
        </div>
      )}
    </div>
  )
}
