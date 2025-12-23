'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, CheckCircle, XCircle, Clock, Mail, Building2 } from 'lucide-react'

interface InvitationData {
  id: string
  email: string
  role: string
  status: string
  expires_at: string
  organization: {
    id: string
    name: string
  }
  inviter: {
    email: string
  }
}

export default function InvitePage({ params }: { params: { token: string } }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invitation, setInvitation] = useState<InvitationData | null>(null)
  const [success, setSuccess] = useState(false)
  const [needsAuth, setNeedsAuth] = useState(false)

  useEffect(() => {
    fetchInvitation()
  }, [params.token])

  const fetchInvitation = async () => {
    try {
      const res = await fetch(`/api/invite/${params.token}`)
      const data = await res.json()

      if (!res.ok) {
        if (data.needsAuth) {
          setNeedsAuth(true)
          setInvitation(data.invitation)
        } else {
          setError(data.error || 'Приглашение не найдено')
        }
        setLoading(false)
        return
      }

      setInvitation(data.invitation)
      setLoading(false)
    } catch (err) {
      setError('Ошибка загрузки приглашения')
      setLoading(false)
    }
  }

  const acceptInvitation = async () => {
    setAccepting(true)
    setError(null)

    try {
      const res = await fetch(`/api/invite/${params.token}/accept`, {
        method: 'POST'
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Ошибка принятия приглашения')
        setAccepting(false)
        return
      }

      setSuccess(true)
      
      // Redirect to organization after 2 seconds
      setTimeout(() => {
        router.push(`/p/${data.org_id}`)
      }, 2000)
    } catch (err) {
      setError('Ошибка принятия приглашения')
      setAccepting(false)
    }
  }

  const goToLogin = () => {
    // Store the invite token to process after login
    sessionStorage.setItem('pendingInviteToken', params.token)
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
          <p className="mt-4 text-gray-600">Загрузка приглашения...</p>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              Добро пожаловать в команду!
            </h2>
            <p className="text-gray-600 mb-4">
              Вы успешно присоединились к организации <strong>{invitation?.organization.name}</strong>
            </p>
            <p className="text-sm text-gray-500">
              Перенаправление...
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error && !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              Приглашение недействительно
            </h2>
            <p className="text-gray-600 mb-6">
              {error}
            </p>
            <Button onClick={() => router.push('/login')}>
              Войти в аккаунт
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (needsAuth && invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center">
              <Mail className="h-8 w-8 text-blue-600" />
            </div>
            <CardTitle>Приглашение в команду</CardTitle>
            <CardDescription>
              Войдите или зарегистрируйтесь, чтобы принять приглашение
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Организация</p>
                  <p className="font-medium">{invitation.organization.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Email для входа</p>
                  <p className="font-medium">{invitation.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Действительно до</p>
                  <p className="font-medium">
                    {new Date(invitation.expires_at).toLocaleDateString('ru-RU', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              <strong>Важно:</strong> Войдите с email <strong>{invitation.email}</strong>, 
              чтобы принять приглашение.
            </div>

            <Button onClick={goToLogin} className="w-full">
              Войти / Зарегистрироваться
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
            <Building2 className="h-8 w-8 text-green-600" />
          </div>
          <CardTitle>Приглашение в команду</CardTitle>
          <CardDescription>
            {invitation?.inviter.email} приглашает вас в организацию
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500">Организация</p>
                <p className="font-medium">{invitation?.organization.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500">Ваш email</p>
                <p className="font-medium">{invitation?.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500">Роль</p>
                <p className="font-medium">
                  {invitation?.role === 'admin' ? 'Администратор' : 
                   invitation?.role === 'owner' ? 'Владелец' : 'Участник'}
                </p>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={() => router.push('/orgs')}
            >
              Отклонить
            </Button>
            <Button 
              className="flex-1"
              onClick={acceptInvitation}
              disabled={accepting}
            >
              {accepting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Принятие...
                </>
              ) : (
                'Принять приглашение'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

