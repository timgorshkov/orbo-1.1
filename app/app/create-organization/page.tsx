'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClientLogger } from '@/lib/logger'

export default function CreateOrganizationPage() {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Используем API endpoint вместо прямого доступа к базе
      const response = await fetch('/api/organizations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
      })
      
      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'Ошибка при создании организации')
      }
      
      // Перенаправляем на дашборд новой организации
      router.push(`/app/${result.org_id}/dashboard`)
      
    } catch (err: any) {
      const logger = createClientLogger('CreateOrganizationPage');
      logger.error({
        error: err.message,
        stack: err.stack,
        org_name: name
      }, 'Error creating organization');
      setError(err.message || 'Произошла неизвестная ошибка')
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-lg mx-auto mt-12">
      <Card>
        <CardHeader>
          <CardTitle>Создание организации</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="text-sm text-neutral-600 block mb-1">
                Название организации
              </label>
              <Input 
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Моя организация"
                required
                minLength={3}
                maxLength={50}
              />
              <p className="text-xs text-neutral-500 mt-1">
                Название можно будет изменить позже
              </p>
            </div>

            {error && (
              <div className="text-sm text-red-500">
                {error}
              </div>
            )}

            <div className="pt-2">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Создание...' : 'Создать организацию'}
              </Button>
            </div>
          </form>
          
          <div className="mt-6 text-center">
            <button 
              onClick={() => router.push('/app')} 
              className="text-sm text-neutral-500 hover:text-neutral-800"
            >
              Вернуться назад
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
