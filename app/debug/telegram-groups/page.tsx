'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function DebugTelegramGroupsPage() {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [orgId, setOrgId] = useState('')
  const [telegramUserId, setTelegramUserId] = useState('')
  
  async function fetchData() {
    setLoading(true)
    setError(null)
    
    try {
      const params = new URLSearchParams()
      if (orgId) params.append('orgId', orgId)
      if (telegramUserId) params.append('telegramUserId', telegramUserId)
      
      const response = await fetch(`/api/debug/telegram-groups?${params.toString()}`)
      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch data')
      }
      
      setData(result)
    } catch (err: any) {
      console.error('Error fetching data:', err)
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }
  
  useEffect(() => {
    fetchData()
  }, [])
  
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Отладка Telegram групп</h1>
      
      <div className="flex gap-4 mb-6">
        <div className="flex-1">
          <label className="block text-sm font-medium mb-1">ID организации</label>
          <Input 
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            placeholder="UUID организации"
          />
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium mb-1">Telegram User ID</label>
          <Input 
            value={telegramUserId}
            onChange={(e) => setTelegramUserId(e.target.value)}
            placeholder="ID пользователя в Telegram"
          />
        </div>
        <div className="flex items-end">
          <Button onClick={fetchData} disabled={loading}>
            {loading ? 'Загрузка...' : 'Обновить'}
          </Button>
        </div>
      </div>
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded mb-6">
          {error}
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Все группы ({data?.allGroups?.length || 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p>Загрузка...</p>
            ) : data?.allGroups?.length > 0 ? (
              <div className="overflow-auto max-h-96">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Название</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID организации</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Статус</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {data.allGroups.map((group: any) => (
                      <tr key={group.id}>
                        <td className="px-3 py-2 whitespace-nowrap text-sm">{group.id}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm">{group.title}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm font-mono text-xs">{group.org_id}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm">{group.bot_status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>Нет групп</p>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Группы организации ({data?.orgGroups?.length || 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p>Загрузка...</p>
            ) : orgId ? (
              data?.orgGroups?.length > 0 ? (
                <div className="overflow-auto max-h-96">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Название</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Telegram Chat ID</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Статус</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {data.orgGroups.map((group: any) => (
                        <tr key={group.id}>
                          <td className="px-3 py-2 whitespace-nowrap text-sm">{group.id}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-sm">{group.title}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-sm">{group.tg_chat_id}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-sm">{group.bot_status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>Нет групп для этой организации</p>
              )
            ) : (
              <p>Укажите ID организации для просмотра групп</p>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Верифицированные аккаунты ({data?.verifiedAccounts?.length || 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p>Загрузка...</p>
            ) : data?.verifiedAccounts?.length > 0 ? (
              <div className="overflow-auto max-h-96">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User ID</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Telegram ID</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Организация</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {data.verifiedAccounts.map((account: any) => (
                      <tr key={account.id}>
                        <td className="px-3 py-2 whitespace-nowrap text-sm">{account.id}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm font-mono text-xs">{account.user_id}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm">{account.telegram_user_id}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm font-mono text-xs">{account.org_id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>Нет верифицированных аккаунтов</p>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Права администраторов ({data?.adminRights?.length || 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p>Загрузка...</p>
            ) : data?.adminRights?.length > 0 ? (
              <div className="overflow-auto max-h-96">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Chat ID</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User ID</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Is Admin</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Is Owner</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {data.adminRights.map((admin: any, index: number) => (
                      <tr key={index}>
                        <td className="px-3 py-2 whitespace-nowrap text-sm">{admin.tg_chat_id}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm">{admin.tg_user_id}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm">{admin.is_admin ? 'Да' : 'Нет'}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm">{admin.is_owner ? 'Да' : 'Нет'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>Нет данных о правах администраторов</p>
            )}
          </CardContent>
        </Card>
      </div>
      
      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Сырые данные</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-gray-100 p-4 rounded overflow-auto max-h-96 text-xs">
              {JSON.stringify(data, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
