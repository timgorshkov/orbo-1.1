'use client'
import { useState } from 'react'
import { createClientBrowser } from '@/lib/supabaseClient'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function SignUp() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    
    try {
      const supabase = createClientBrowser()
      const { error } = await supabase.auth.signInWithOtp({ 
        email, 
        options: { 
          emailRedirectTo: `${window.location.origin}/app` 
        } 
      })
      
      if (error) {
        setMessage(`Ошибка: ${error.message}`)
      } else {
        setMessage('Мы отправили ссылку для подтверждения на email')
      }
    } catch (error) {
      setMessage('Произошла ошибка при отправке email')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen grid place-items-center">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-3 bg-white border p-6 rounded-2xl">
        <h1 className="text-xl font-semibold">Регистрация в Orbo</h1>
        
        <div className="space-y-1">
          <label htmlFor="email" className="text-sm text-neutral-600">Email</label>
          <Input 
            id="email"
            type="email"
            placeholder="you@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
        </div>
        
        <Button 
          type="submit" 
          className="w-full" 
          disabled={loading}
        >
          {loading ? 'Отправка...' : 'Зарегистрироваться'}
        </Button>
        
        {message && (
          <p className={`text-sm ${message.includes('Ошибка') ? 'text-red-500' : 'text-green-600'}`}>
            {message}
          </p>
        )}
        
        <p className="text-xs text-center text-neutral-500 pt-2">
          Уже есть аккаунт? <a href="/signin" className="underline">Войти</a>
        </p>
      </form>
    </div>
  )
}
