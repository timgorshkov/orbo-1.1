'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClientBrowser } from '@/lib/client/supabaseClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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
      // Получаем Supabase клиент
      const supabase = createClientBrowser()
      
      // Проверяем авторизацию пользователя
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        setError('Необходимо авторизоваться')
        setLoading(false)
        return
      }

      // Создаем новую организацию
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({
          name: name.trim(),
          plan: 'free' // Базовый план по умолчанию
        })
        .select('id')
        .single()
        
      if (orgError) {
        console.error('Error creating organization:', orgError)
        setError(orgError.message)
        setLoading(false)
        return
      }
      
      // Создаем членство для текущего пользователя как владельца
      const { error: memberError } = await supabase
        .from('memberships')
        .insert({
          org_id: org.id,
          user_id: user.id,
          role: 'owner' // Роль владельца
        })
      
      if (memberError) {
        console.error('Error creating membership:', memberError)
        setError(memberError.message)
        setLoading(false)
        return
      }
      
      // Перенаправляем на дашборд новой организации
      router.push(`/app/${org.id}/dashboard`)
      
    } catch (err: any) {
      console.error('Unexpected error:', err)
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
