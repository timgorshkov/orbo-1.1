'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function AuthDebugPage() {
  const [authData, setAuthData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOrgLoading, setCreateOrgLoading] = useState(false)
  const [createOrgResult, setCreateOrgResult] = useState<any>(null)
  
  useEffect(() => {
    async function fetchAuthData() {
      try {
        const response = await fetch('/api/debug/auth')
        const data = await response.json()
        setAuthData(data)
      } catch (err: any) {
        setError(err.message || 'Ошибка при получении данных аутентификации')
      } finally {
        setLoading(false)
      }
    }
    
    fetchAuthData()
  }, [])
  
  async function handleCreateTestOrg() {
    if (!authData?.regularUser?.id) {
      setError('Пользователь не авторизован')
      return
    }
    
    setCreateOrgLoading(true)
    setCreateOrgResult(null)
    
    try {
      const response = await fetch('/api/debug/create-test-org', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: authData.regularUser.id }),
      })
      
      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'Ошибка при создании тестовой организации')
      }
      
      setCreateOrgResult(result)
    } catch (err: any) {
      setError(err.message || 'Произошла неизвестная ошибка')
    } finally {
      setCreateOrgLoading(false)
    }
  }
  
  if (loading) {
    return <div className="p-6">Загрузка данных аутентификации...</div>
  }
  
  if (error) {
    return <div className="p-6 text-red-500">{error}</div>
  }
  
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Диагностика аутентификации</h1>
      
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Информация о сессии</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div>
                <span className="font-medium">Сессия существует:</span> {authData.session.exists ? 'Да' : 'Нет'}
              </div>
              {authData.session.error && (
                <div className="text-red-500">
                  Ошибка: {authData.session.error}
                </div>
              )}
              {authData.session.userId && (
                <div>
                  <span className="font-medium">ID пользователя в сессии:</span> {authData.session.userId}
                </div>
              )}
              {authData.session.expiresAt && (
                <div>
                  <span className="font-medium">Истекает:</span> {new Date(authData.session.expiresAt * 1000).toLocaleString()}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Информация о пользователе</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium">Стандартный клиент</h3>
                <div className="space-y-2">
                  <div>
                    <span className="font-medium">Пользователь существует:</span> {authData.regularUser.exists ? 'Да' : 'Нет'}
                  </div>
                  {authData.regularUser.error && (
                    <div className="text-red-500">
                      Ошибка: {authData.regularUser.error}
                    </div>
                  )}
                  {authData.regularUser.id && (
                    <div>
                      <span className="font-medium">ID пользователя:</span> {authData.regularUser.id}
                    </div>
                  )}
                  {authData.regularUser.email && (
                    <div>
                      <span className="font-medium">Email:</span> {authData.regularUser.email}
                    </div>
                  )}
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-medium">Сервисная роль</h3>
                <div className="space-y-2">
                  <div>
                    <span className="font-medium">Пользователь существует:</span> {authData.adminUser.exists ? 'Да' : 'Нет'}
                  </div>
                  {authData.adminUser.error && (
                    <div className="text-red-500">
                      Ошибка: {authData.adminUser.error}
                    </div>
                  )}
                  {authData.adminUser.id && (
                    <div>
                      <span className="font-medium">ID пользователя:</span> {authData.adminUser.id}
                    </div>
                  )}
                  {authData.adminUser.email && (
                    <div>
                      <span className="font-medium">Email:</span> {authData.adminUser.email}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Организации</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium">Стандартный клиент</h3>
                <div className="space-y-2">
                  <div>
                    <span className="font-medium">Количество организаций:</span> {authData.organizations.regularClient.count}
                  </div>
                  {authData.organizations.regularClient.error && (
                    <div className="text-red-500">
                      Ошибка: {authData.organizations.regularClient.error}
                    </div>
                  )}
                  {authData.organizations.regularClient.data && authData.organizations.regularClient.data.length > 0 && (
                    <div>
                      <span className="font-medium">Организации:</span>
                      <ul className="list-disc pl-5 mt-2">
                        {authData.organizations.regularClient.data.map((org: any) => (
                          <li key={org.org_id}>
                            {org.organizations?.name || org.org_id} (Роль: {org.role})
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-medium">Сервисная роль</h3>
                <div className="space-y-2">
                  <div>
                    <span className="font-medium">Количество организаций:</span> {authData.organizations.serviceRole.count}
                  </div>
                  {authData.organizations.serviceRole.error && (
                    <div className="text-red-500">
                      Ошибка: {authData.organizations.serviceRole.error}
                    </div>
                  )}
                  {authData.organizations.serviceRole.data && authData.organizations.serviceRole.data.length > 0 && (
                    <div>
                      <span className="font-medium">Организации:</span>
                      <ul className="list-disc pl-5 mt-2">
                        {authData.organizations.serviceRole.data.map((org: any) => (
                          <li key={org.org_id}>
                            {org.organizations?.name || org.org_id} (Роль: {org.role})
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-medium">Все организации в системе</h3>
                <div className="space-y-2">
                  <div>
                    <span className="font-medium">Количество организаций:</span> {authData.organizations.allOrgs.count}
                  </div>
                  {authData.organizations.allOrgs.error && (
                    <div className="text-red-500">
                      Ошибка: {authData.organizations.allOrgs.error}
                    </div>
                  )}
                  {authData.organizations.allOrgs.data && authData.organizations.allOrgs.data.length > 0 && (
                    <div>
                      <span className="font-medium">Организации:</span>
                      <ul className="list-disc pl-5 mt-2">
                        {authData.organizations.allOrgs.data.map((org: any) => (
                          <li key={org.id}>
                            {org.name} (ID: {org.id})
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-medium">Все членства в системе</h3>
                <div className="space-y-2">
                  <div>
                    <span className="font-medium">Количество членств:</span> {authData.organizations.allMemberships.count}
                  </div>
                  {authData.organizations.allMemberships.error && (
                    <div className="text-red-500">
                      Ошибка: {authData.organizations.allMemberships.error}
                    </div>
                  )}
                  {authData.organizations.allMemberships.data && authData.organizations.allMemberships.data.length > 0 && (
                    <div>
                      <span className="font-medium">Членства:</span>
                      <ul className="list-disc pl-5 mt-2">
                        {authData.organizations.allMemberships.data.map((membership: any) => (
                          <li key={membership.id}>
                            User ID: {membership.user_id}, Org ID: {membership.org_id}, Роль: {membership.role}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="mt-6">
              <Button 
                onClick={handleCreateTestOrg} 
                disabled={createOrgLoading || !authData.regularUser.id}
              >
                {createOrgLoading ? 'Создание...' : 'Создать тестовую организацию'}
              </Button>
              
              {createOrgResult && (
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded">
                  <h4 className="font-medium text-green-700">Организация успешно создана!</h4>
                  <div className="mt-2">
                    <div>ID организации: {createOrgResult.organization.id}</div>
                    <div>ID членства: {createOrgResult.membership.id}</div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Cookies</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div>
                <span className="font-medium">Количество cookies:</span> {authData.cookies.count}
              </div>
              {authData.cookies.names && authData.cookies.names.length > 0 && (
                <div>
                  <span className="font-medium">Имена cookies:</span>
                  <ul className="list-disc pl-5 mt-2">
                    {authData.cookies.names.map((name: string) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
