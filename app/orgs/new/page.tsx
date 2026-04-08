'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
// Removed: createClientBrowser - using API instead
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClientLogger } from '@/lib/logger'
import { ymGoal } from '@/components/analytics/YandexMetrika'

export default function CreateOrganization() {
  const router = useRouter()
  const { data: nextAuthSession, status: nextAuthStatus } = useSession()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true) // Start with loading true to check org count
  const [error, setError] = useState<string | null>(null)
  const [orgCount, setOrgCount] = useState<number | null>(null)
  const [isFirstOrg, setIsFirstOrg] = useState(false)
  const goalSent = useRef(false) // Prevent duplicate goal sends

  // Check organization count on mount
  useEffect(() => {
    async function checkOrgCount() {
      // Wait for NextAuth to finish loading
      if (nextAuthStatus === 'loading') {
        return
      }

      try {
        // Check if user is authenticated
        if (nextAuthStatus !== 'authenticated') {
          router.push('/signin')
          return
        }

        // Fetch org count via API
        try {
          const response = await fetch('/api/user/organizations')
          if (response.ok) {
            const data = await response.json()
            const count = data.organizations?.length || 0
            setOrgCount(count)
            setIsFirstOrg(count === 0)
            if (count === 0) {
              setName('Моё сообщество')
            }
          }
        } catch (apiErr) {
          // Fallback: assume first org if we can't get count
          setOrgCount(0)
          setIsFirstOrg(true)
          setName('Моё сообщество')
        }
        setLoading(false)
      } catch (err) {
        const logger = createClientLogger('CreateOrganization');
        logger.error({
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined
        }, 'Error checking organization count');
        setLoading(false)
      }
    }

    checkOrgCount()
  }, [router, nextAuthStatus, nextAuthSession])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    try {
      // Check if user is authenticated
      if (nextAuthStatus !== 'authenticated') {
        throw new Error('Вы не авторизованы')
      }

      // Create organization via API endpoint (uses service role to bypass RLS)
      // API will handle user identification via cookies
      const response = await fetch('/api/organizations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: name.trim()
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Ошибка при создании организации')
      }

      // Track organization creation (prevent duplicates from double-click)
      if (!goalSent.current) {
        goalSent.current = true;
        
        // Track first organization creation (key conversion!)
        if (isFirstOrg) {
          ymGoal('first_org_created', undefined, { once: true });
        }
        
        // Track any organization creation
        ymGoal('org_created');
      }

      // Redirect to organization dashboard
      router.push(`/app/${result.org_id}/dashboard`)
    } catch (err) {
      const logger = createClientLogger('CreateOrganization');
      logger.error({
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        org_name: name
      }, 'Error creating organization');
      setError(err instanceof Error ? err.message : 'Произошла ошибка при создании организации')
      setLoading(false)
    }
  }

  // Show loading skeleton matching the final form layout to avoid CLS
  if (loading || orgCount === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="h-7 w-3/4 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-full bg-gray-100 rounded animate-pulse mt-2" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="h-4 w-1/3 bg-gray-200 rounded animate-pulse" />
                <div className="h-10 w-full bg-gray-100 rounded animate-pulse" />
                <div className="h-8 w-full bg-gray-50 rounded animate-pulse" />
              </div>
              <div className="flex gap-3">
                <div className="h-10 flex-1 bg-gray-100 rounded animate-pulse" />
                <div className="h-10 flex-1 bg-gray-200 rounded animate-pulse" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Создайте своё пространство</CardTitle>
          <CardDescription>
            Через пару минут вы сможете провести первое событие и увидеть карточки участников
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Название пространства {isFirstOrg && <span className="text-gray-400 font-normal">(можно изменить позже)</span>}
              </label>
              <Input
                id="name"
                type="text"
                placeholder="Моё сообщество"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={3}
                maxLength={100}
              />
              {isFirstOrg ? (
                <p className="text-xs text-blue-600 bg-blue-50 p-2 rounded">
                  💡 <strong>Совет:</strong> Это название увидите только вы. Оставьте как есть или назовите понятно: "Бизнес-клуб", "IT-сообщество", "Наш коворкинг". Можно изменить позже.
                </p>
              ) : (
                <p className="text-xs text-gray-500">
                  После создания вы сможете подключить группы и настроить события
                </p>
              )}
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={loading}
                className="flex-1"
              >
                Отмена
              </Button>
              <Button 
                type="submit" 
                disabled={loading}
                className="flex-1"
              >
                {loading ? 'Создание...' : 'Создать'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}


