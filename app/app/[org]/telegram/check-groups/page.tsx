'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/app-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckGroupsForm } from '../components/check-groups-form'

export default function CheckGroupsPage({ params }: { params: { org: string } }) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null);

  // Add useEffect to load user info
  useEffect(() => {
    async function loadUser() {
      try {
        const response = await fetch('/api/user/info');
        const data = await response.json();
        if (data.user?.id) {
          setUserId(data.user.id);
        }
      } catch (error) {
        console.error('Failed to load user info:', error);
      }
    }
    
    loadUser();
  }, []);
  
  // Используем пустой массив для telegramGroups, т.к. AppShell сам загрузит группы
  return (
    <AppShell 
      orgId={params.org} 
      currentPath={`/app/${params.org}/telegram/check-groups`}
      telegramGroups={[]}
    >
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Проверка Telegram групп</h1>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Поиск доступных групп</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-neutral-600 space-y-3">
            <p>
              <strong className="font-medium">1)</strong> Пригласите бота в ваши группы и назначьте администратором.
            </p>
            <p className="bg-neutral-50 rounded p-2 font-mono">
              @orbo_community_bot
            </p>
            <p>
              <strong className="font-medium">2)</strong> Нажмите «Проверить мои группы», чтобы найти группы, где вы администратор.
            </p>
          </div>
          
          <CheckGroupsForm orgId={params.org} userId={userId || ''} />
        </CardContent>
      </Card>
    </AppShell>
  )
}
