'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function DebugTelegramAdminsPage() {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [orgId, setOrgId] = useState('')
  
  async function updateAdmins() {
    if (!orgId) {
      setError('Пожалуйста, укажите ID организации')
      return
    }
    
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/api/telegram/groups/update-admins', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ orgId })
      })
      
      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to update admin rights')
      }
      
      setData(result)
    } catch (err: any) {
      console.error('Error updating admin rights:', err)
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Обновление прав администраторов Telegram</h1>
      
      <div className="flex gap-4 mb-6">
        <div className="flex-1">
          <label className="block text-sm font-medium mb-1">ID организации</label>
          <Input 
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            placeholder="UUID организации"
          />
        </div>
        <div className="flex items-end">
          <Button onClick={updateAdmins} disabled={loading}>
            {loading ? 'Обновление...' : 'Обновить права администраторов'}
          </Button>
        </div>
      </div>
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded mb-6">
          {error}
        </div>
      )}
      
      {data && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Результат обновления</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p><strong>Статус:</strong> {data.success ? 'Успешно' : 'Ошибка'}</p>
                <p><strong>Сообщение:</strong> {data.message}</p>
                <p><strong>Обновлено:</strong> {data.updated} из {data.total} пар пользователь-группа</p>
              </div>
            </CardContent>
          </Card>
          
          {data.results && data.results.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Детали обновления</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto max-h-96">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID аккаунта</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID группы</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Статус</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Владелец</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Админ</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Сообщение</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {data.results.map((result: any, index: number) => (
                        <tr key={index} className={
                          result.status === 'success' ? 'bg-green-50' : 
                          result.status === 'error' ? 'bg-red-50' : 
                          'bg-yellow-50'
                        }>
                          <td className="px-3 py-2 whitespace-nowrap text-sm">{result.account_id}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-sm">{result.group_id}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-sm">
                            {result.status === 'success' ? '✅ Успех' : 
                             result.status === 'error' ? '❌ Ошибка' : 
                             '⚠️ Не админ'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-sm">
                            {result.is_owner === true ? 'Да' : 
                             result.is_owner === false ? 'Нет' : '-'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-sm">
                            {result.is_admin === true ? 'Да' : 
                             result.is_admin === false ? 'Нет' : '-'}
                          </td>
                          <td className="px-3 py-2 text-sm">{result.message || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
          
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
      )}
      
      <div className="mt-6">
        <h2 className="text-xl font-semibold mb-4">Инструкции</h2>
        <ol className="list-decimal pl-5 space-y-2">
          <li>Введите ID организации, для которой нужно обновить права администраторов.</li>
          <li>Нажмите кнопку "Обновить права администраторов".</li>
          <li>Система проверит для каждого верифицированного пользователя Telegram в организации его права администратора во всех группах организации.</li>
          <li>Для каждой пары пользователь-группа, где пользователь является администратором, будет создана или обновлена запись в таблице telegram_group_admins.</li>
          <li>Результаты обновления будут отображены в таблице ниже.</li>
        </ol>
        
        <div className="mt-4 bg-blue-50 p-4 rounded">
          <h3 className="font-medium text-blue-900 mb-2">Примечание</h3>
          <p className="text-blue-800">
            Этот инструмент полезен, если у вас есть группы Telegram, связанные с организацией, но нет записей в таблице telegram_group_admins.
            После обновления прав администраторов, система сможет корректно отображать группы в интерфейсе пользователя.
          </p>
        </div>
      </div>
    </div>
  )
}
