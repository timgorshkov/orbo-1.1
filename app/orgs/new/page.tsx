'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClientBrowser } from '@/lib/client/supabaseClient'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function CreateOrganization() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true) // Start with loading true to check org count
  const [error, setError] = useState<string | null>(null)
  const [orgCount, setOrgCount] = useState<number | null>(null)

  // Check organization count on mount
  useEffect(() => {
    async function checkOrgCount() {
      try {
        const supabase = createClientBrowser()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
          router.push('/signin')
          return
        }

        // Get organization count
        const { data: memberships } = await supabase
          .from('memberships')
          .select('org_id')
          .eq('user_id', user.id)

        const count = memberships?.length || 0
        setOrgCount(count)

        // If user has 0 organizations, redirect to welcome page
        if (count === 0) {
          router.push('/welcome')
          return
        }

        setLoading(false)
      } catch (err) {
        console.error('Error checking organization count:', err)
        setLoading(false)
      }
    }

    checkOrgCount()
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    try {
      const supabase = createClientBrowser()
      
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      
      if (userError || !user) {
        throw new Error('Вы не авторизованы')
      }

      // Create organization via API endpoint (uses service role to bypass RLS)
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

      // Redirect to organization dashboard
      router.push(`/app/${result.org_id}/dashboard`)
    } catch (err) {
      console.error('Error creating organization:', err)
      setError(err instanceof Error ? err.message : 'Произошла ошибка при создании организации')
      setLoading(false)
    }
  }

  // Show loading state while checking org count
  if (loading || orgCount === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6">
            <div className="text-center">Загрузка...</div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Создать пространство</CardTitle>
          <CardDescription>
            Создайте новое пространство для управления сообществом через Telegram
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Название пространства
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
              <p className="text-xs text-gray-500">
                После создания вы сможете настроить пространство
              </p>
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


