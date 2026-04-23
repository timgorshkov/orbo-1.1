'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function RegistratorInvitePage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orgName, setOrgName] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/registrator/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name: name.trim() }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Не удалось активировать')
        return
      }

      setOrgName(data.orgName)
      // Redirect to check-in page
      setTimeout(() => {
        router.push('/checkin')
      }, 1500)
    } catch {
      setError('Ошибка сети')
    } finally {
      setLoading(false)
    }
  }

  if (orgName) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-xl shadow-lg max-w-sm w-full p-8 text-center">
          <div className="text-4xl mb-4">✅</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Добро пожаловать!</h1>
          <p className="text-gray-600 mb-1">Вы подключены как регистратор</p>
          <p className="text-gray-600">организации <strong>{orgName}</strong></p>
          <p className="text-sm text-gray-400 mt-4">Перенаправляем на сканер...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-sm w-full p-8">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🎫</div>
          <h1 className="text-xl font-bold text-gray-900">Регистратор на мероприятии</h1>
          <p className="text-sm text-gray-500 mt-2">
            Введите ваше имя для начала работы
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ваше имя
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Иван Иванов"
              required
              autoFocus
              disabled={loading}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Подключение...' : 'Начать работу'}
          </button>
        </form>

        <p className="text-xs text-gray-400 text-center mt-6">
          Вы получите доступ к сканированию QR-кодов участников
        </p>
      </div>
    </div>
  )
}
