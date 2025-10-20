'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ParticipantAvatar } from '@/components/members/participant-avatar'
import { Crown, Shield, User, Mail, MessageSquare, LogOut, Edit2, Save, X } from 'lucide-react'

type ProfileData = {
  user: {
    id: string
    email: string | null
    email_confirmed: boolean
    email_confirmed_at: string | null
    metadata: any
    created_at: string
  }
  membership: {
    role: 'owner' | 'admin' | 'member'
    role_source: string
    is_shadow_profile: boolean
    created_at: string
    admin_groups: Array<{ id: number; title: string }>
    metadata: any
  }
  telegram: {
    id: number
    telegram_user_id: number
    telegram_username?: string
    telegram_first_name?: string
    telegram_last_name?: string
    is_verified: boolean
    verified_at?: string
    created_at: string
  } | null
  participant: {
    id: string
    full_name: string | null
    first_name: string | null
    last_name: string | null
    username: string | null
    bio: string | null
    photo_url: string | null
    email: string | null
    phone: string | null
    custom_attributes: any
    tg_user_id: string | null
    participant_status: string
    source: string | null
    last_activity_at: string | null
  } | null
  organization: {
    id: string
    name: string
    logo_url: string | null
  } | null
}

export default function ProfilePage({ params }: { params: { org: string } }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // Editing state
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState({
    full_name: '',
    bio: '',
    phone: '',
    custom_attributes: {} as Record<string, any>
  })
  
  // Custom attributes as array (to avoid losing focus when editing keys)
  const [customAttributesArray, setCustomAttributesArray] = useState<Array<{ id: string; key: string; value: string }>>([])
  
  // Convert custom_attributes object to array for editing
  const attributesToArray = (attrs: Record<string, any>) => {
    return Object.entries(attrs).map(([key, value]) => ({
      id: `attr_${Date.now()}_${Math.random()}`,
      key,
      value: String(value)
    }))
  }
  
  // Convert array back to object for saving
  const arrayToAttributes = (arr: Array<{ id: string; key: string; value: string }>) => {
    const result: Record<string, any> = {}
    arr.forEach(({ key, value }) => {
      if (key.trim()) { // Only add non-empty keys
        result[key] = value
      }
    })
    return result
  }

  // Telegram linking state
  const [showTelegramForm, setShowTelegramForm] = useState(false)
  const [telegramUserId, setTelegramUserId] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [telegramError, setTelegramError] = useState<string | null>(null)
  const [telegramSuccess, setTelegramSuccess] = useState<string | null>(null)
  const [savingTelegram, setSavingTelegram] = useState(false)
  const [verifying, setVerifying] = useState(false)

  // Email activation state (for shadow profiles)
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [activationEmail, setActivationEmail] = useState('')
  const [activationCode, setActivationCode] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null)
  const [sendingCode, setSendingCode] = useState(false)
  const [activating, setActivating] = useState(false)

  useEffect(() => {
    fetchProfile()
  }, [params.org])

  const fetchProfile = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/user/profile?orgId=${params.org}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch profile')
      }

      setProfile(data.profile)
      
      // Initialize edit form
      console.log('[Profile Page] Profile loaded:', {
        hasParticipant: !!data.profile.participant,
        participantData: data.profile.participant
      })
      
      if (data.profile.participant) {
        const attrs = data.profile.participant.custom_attributes || {}
        setEditForm({
          full_name: data.profile.participant.full_name || '',
          bio: data.profile.participant.bio || '',
          phone: data.profile.participant.phone || '',
          custom_attributes: attrs
        })
        setCustomAttributesArray(attributesToArray(attrs))
        console.log('[Profile Page] Edit form initialized:', {
          full_name: data.profile.participant.full_name || '',
          bio: data.profile.participant.bio || '',
          phone: data.profile.participant.phone || '',
          custom_attributes: attrs
        })
      } else {
        console.warn('[Profile Page] No participant data found in profile')
      }
    } catch (e: any) {
      console.error('Error fetching profile:', e)
      setError(e.message || 'Failed to fetch profile')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveProfile = async () => {
    setSaving(true)
    setError(null)
    try {
      // Convert array back to object for saving
      const dataToSave = {
        ...editForm,
        custom_attributes: arrayToAttributes(customAttributesArray)
      }
      
      const response = await fetch(`/api/user/profile?orgId=${params.org}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSave)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to update profile')
      }

      // Update local state
      if (profile) {
        setProfile({
          ...profile,
          participant: data.participant
        })
      }

      setIsEditing(false)
    } catch (e: any) {
      console.error('Error saving profile:', e)
      setError(e.message || 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = async () => {
    if (confirm('Вы уверены, что хотите выйти?')) {
      try {
        await fetch('/api/auth/logout', { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        })
        window.location.href = '/signin'
      } catch (error) {
        console.error('Logout error:', error)
        window.location.href = '/signin'
      }
    }
  }

  const handleLinkTelegram = async () => {
    if (!telegramUserId) {
      setTelegramError('Пожалуйста, укажите Telegram User ID')
      return
    }

    setSavingTelegram(true)
    setTelegramError(null)
    setTelegramSuccess(null)

    try {
      const response = await fetch('/api/telegram/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: params.org,
          telegramUserId: parseInt(telegramUserId)
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to link Telegram')
      }

      setTelegramSuccess('Telegram User ID сохранен! Теперь верифицируйте аккаунт.')
      await fetchProfile() // Reload profile
    } catch (e: any) {
      console.error('Error linking Telegram:', e)
      setTelegramError(e.message || 'Failed to link Telegram')
    } finally {
      setSavingTelegram(false)
    }
  }

  const handleVerifyTelegram = async () => {
    if (!verificationCode) {
      setTelegramError('Пожалуйста, введите код верификации')
      return
    }

    setVerifying(true)
    setTelegramError(null)
    setTelegramSuccess(null)

    try {
      const response = await fetch('/api/telegram/accounts/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: params.org,
          code: verificationCode
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to verify Telegram')
      }

      setTelegramSuccess('Telegram аккаунт успешно верифицирован!')
      setVerificationCode('')
      await fetchProfile() // Reload profile
    } catch (e: any) {
      console.error('Error verifying Telegram:', e)
      setTelegramError(e.message || 'Failed to verify Telegram')
    } finally {
      setVerifying(false)
    }
  }

  const handleSendActivationCode = async () => {
    if (!activationEmail || !activationEmail.includes('@')) {
      setEmailError('Пожалуйста, введите корректный email')
      return
    }

    setSendingCode(true)
    setEmailError(null)
    setEmailSuccess(null)

    try {
      const response = await fetch('/api/auth/activate-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: activationEmail,
          step: 'request_code'
        })
      })

      const data = await response.json()

      if (!response.ok) {
        if (response.status === 409 && data.action === 'link_profiles') {
          setEmailError(`${data.error}. ${data.details}`)
          return
        }
        throw new Error(data.details || data.error || 'Failed to send code')
      }

      setEmailSuccess('Код отправлен на указанный email!')
    } catch (e: any) {
      console.error('Error sending activation code:', e)
      setEmailError(e.message || 'Failed to send code')
    } finally {
      setSendingCode(false)
    }
  }

  const handleActivateProfile = async () => {
    if (!activationCode) {
      setEmailError('Пожалуйста, введите код подтверждения')
      return
    }

    setActivating(true)
    setEmailError(null)
    setEmailSuccess(null)

    try {
      const response = await fetch('/api/auth/activate-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: activationEmail,
          code: activationCode,
          step: 'verify_code'
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to activate profile')
      }

      setEmailSuccess('Email успешно добавлен и подтвержден! Перезагружаем профиль...')
      setTimeout(() => {
        fetchProfile()
        setShowEmailForm(false)
        setActivationEmail('')
        setActivationCode('')
      }, 1500)
    } catch (e: any) {
      console.error('Error activating profile:', e)
      setEmailError(e.message || 'Failed to activate profile')
    } finally {
      setActivating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Загрузка профиля...</p>
        </div>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error || 'Failed to load profile'}</p>
          <Button onClick={() => fetchProfile()} className="mt-4">
            Попробовать снова
          </Button>
        </div>
      </div>
    )
  }

  const displayName = profile.participant?.full_name || 
                      (profile.participant?.username ? `@${profile.participant.username}` : null) ||
                      (profile.participant?.tg_user_id ? `ID: ${profile.participant.tg_user_id}` : null) ||
                      profile.telegram?.telegram_first_name ||
                      profile.user.email ||
                      'Пользователь'

  const roleIcon = profile.membership.role === 'owner' ? (
    <Crown className="h-5 w-5 text-purple-600" />
  ) : profile.membership.role === 'admin' ? (
    <Shield className="h-5 w-5 text-blue-600" />
  ) : (
    <User className="h-5 w-5 text-gray-600" />
  )

  const roleName = profile.membership.role === 'owner' ? 'Владелец' :
                   profile.membership.role === 'admin' ? 'Администратор' :
                   'Участник'

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header with Logout button */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Профиль</h1>
          <p className="text-gray-600 mt-2">
            Управление вашим профилем в организации {profile.organization?.name}
          </p>
        </div>
        <Button
          onClick={handleLogout}
          variant="outline"
          className="text-red-600 border-red-300 hover:bg-red-50 bg-transparent"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Выйти из профиля
        </Button>
      </div>

        {/* Shadow Profile Banner */}
        {profile.membership.is_shadow_profile && !showEmailForm && (
          <div className="mb-6 bg-amber-50 border-2 border-amber-300 rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                  <span className="text-2xl">👻</span>
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-amber-900 mb-2">
                  Активируйте свой профиль
                </h3>
                <p className="text-amber-800 mb-4">
                  Вы вошли как теневой администратор. Для получения полного доступа к редактированию 
                  материалов и событий необходимо добавить и подтвердить email адрес.
                </p>
                <Button
                  onClick={() => setShowEmailForm(true)}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Добавить email
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Email Activation Form */}
        {showEmailForm && (
          <Card className="mb-6 border-2 border-blue-300">
            <CardHeader>
              <CardTitle>Активация профиля</CardTitle>
              <CardDescription>
                Добавьте и подтвердите email для получения полного доступа
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {emailError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                  {emailError}
                </div>
              )}
              {emailSuccess && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                  {emailSuccess}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email адрес
                </label>
                <Input
                  type="email"
                  value={activationEmail}
                  onChange={(e) => setActivationEmail(e.target.value)}
                  placeholder="your@email.com"
                  disabled={sendingCode || activating || !!emailSuccess}
                />
              </div>

              {!emailSuccess && (
                <Button
                  onClick={handleSendActivationCode}
                  disabled={sendingCode || !activationEmail}
                  className="w-full"
                >
                  {sendingCode ? 'Отправка...' : 'Отправить код подтверждения'}
                </Button>
              )}

              {emailSuccess && !activationCode && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Код подтверждения из email
                  </label>
                  <Input
                    type="text"
                    value={activationCode}
                    onChange={(e) => setActivationCode(e.target.value)}
                    placeholder="Введите код"
                    disabled={activating}
                  />
                  <Button
                    onClick={handleActivateProfile}
                    disabled={activating || !activationCode}
                    className="w-full mt-3"
                  >
                    {activating ? 'Активация...' : 'Подтвердить email'}
                  </Button>
                </div>
              )}

              <Button
                onClick={() => {
                  setShowEmailForm(false)
                  setActivationEmail('')
                  setActivationCode('')
                  setEmailError(null)
                  setEmailSuccess(null)
                }}
                variant="outline"
                className="w-full"
              >
                Отмена
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Main Profile Card */}
        <Card className="mb-6">
          <CardHeader className="pb-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <ParticipantAvatar
                  participantId={profile.participant?.id || profile.user.id}
                  photoUrl={profile.participant?.photo_url || null}
                  tgUserId={profile.participant?.tg_user_id || null}
                  displayName={displayName}
                  size="lg"
                />
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-2xl font-bold text-gray-900">{displayName}</h2>
                    {roleIcon}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-700">
                      {roleName}
                    </span>
                    {profile.membership.is_shadow_profile && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-700">
                        👻 Теневой профиль
                      </span>
                    )}
                    {profile.membership.role_source === 'telegram_admin' && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-sm font-medium bg-blue-50 text-blue-600">
                        Из Telegram
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {!profile.membership.is_shadow_profile && !isEditing && (
                <Button
                  onClick={() => {
                    // Инициализируем форму при переходе в режим редактирования
                    if (profile.participant) {
                      const attrs = profile.participant.custom_attributes || {}
                      setEditForm({
                        full_name: profile.participant.full_name || '',
                        bio: profile.participant.bio || '',
                        phone: profile.participant.phone || '',
                        custom_attributes: attrs
                      })
                      setCustomAttributesArray(attributesToArray(attrs))
                      console.log('[Profile Page] Edit mode activated, form initialized:', {
                        full_name: profile.participant.full_name || '',
                        bio: profile.participant.bio || '',
                        phone: profile.participant.phone || '',
                        custom_attributes: attrs
                      })
                    }
                    setIsEditing(true)
                  }}
                  variant="outline"
                  size="sm"
                >
                  <Edit2 className="h-4 w-4 mr-2" />
                  Редактировать
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Полное имя
                  </label>
                  <Input
                    type="text"
                    value={editForm.full_name}
                    onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                    placeholder="Введите имя"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Телефон
                  </label>
                  <Input
                    type="tel"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    placeholder="+7 (999) 123-45-67"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Описание
                  </label>
                  <textarea
                    value={editForm.bio}
                    onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                    placeholder="Расскажите о себе"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                  />
                </div>
                
                {/* Custom Attributes */}
                <div className="border-t pt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Дополнительные атрибуты
                  </label>
                  <div className="space-y-2">
                    {customAttributesArray.map((attr) => (
                      <div key={attr.id} className="flex gap-2">
                        <Input
                          type="text"
                          value={attr.key}
                          onChange={(e) => {
                            setCustomAttributesArray(
                              customAttributesArray.map(a => 
                                a.id === attr.id ? { ...a, key: e.target.value } : a
                              )
                            )
                          }}
                          placeholder="например, город"
                          className="flex-1"
                        />
                        <Input
                          type="text"
                          value={attr.value}
                          onChange={(e) => {
                            setCustomAttributesArray(
                              customAttributesArray.map(a => 
                                a.id === attr.id ? { ...a, value: e.target.value } : a
                              )
                            )
                          }}
                          placeholder="Значение"
                          className="flex-1"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setCustomAttributesArray(
                              customAttributesArray.filter(a => a.id !== attr.id)
                            )
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setCustomAttributesArray([
                          ...customAttributesArray,
                          {
                            id: `attr_${Date.now()}_${Math.random()}`,
                            key: '',
                            value: ''
                          }
                        ])
                      }}
                    >
                      + Добавить атрибут
                    </Button>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button onClick={handleSaveProfile} disabled={saving}>
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? 'Сохранение...' : 'Сохранить'}
                  </Button>
                  <Button
                    onClick={() => {
                      setIsEditing(false)
                      // Reset form
                      if (profile.participant) {
                        const attrs = profile.participant.custom_attributes || {}
                        setEditForm({
                          full_name: profile.participant.full_name || '',
                          bio: profile.participant.bio || '',
                          phone: profile.participant.phone || '',
                          custom_attributes: attrs
                        })
                        setCustomAttributesArray(attributesToArray(attrs))
                      }
                    }}
                    variant="outline"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Отмена
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Основная информация - ВСЕГДА показываем */}
                {profile.participant && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Основная информация</h3>
                    <div className="space-y-2">
                      {/* Полное имя */}
                      {profile.participant.full_name && (
                        <div className="flex items-center gap-2 text-sm">
                          <User className="h-4 w-4 text-gray-400" />
                          <span className="text-gray-600">Имя:</span>
                          <span className="font-medium text-gray-900">{profile.participant.full_name}</span>
                        </div>
                      )}
                      
                      {/* Telegram username */}
                      {profile.participant.username && (
                        <div className="flex items-center gap-2 text-sm">
                          <MessageSquare className="h-4 w-4 text-gray-400" />
                          <span className="text-gray-600">Telegram:</span>
                          <span className="font-medium text-gray-900">@{profile.participant.username}</span>
                        </div>
                      )}
                      
                      {/* Telegram ID */}
                      {profile.participant.tg_user_id && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-gray-600">Telegram ID:</span>
                          <span className="font-medium text-gray-900">{profile.participant.tg_user_id}</span>
                        </div>
                      )}
                      
                      {/* Имя и Фамилия (если есть) */}
                      {(profile.participant.first_name || profile.participant.last_name) && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-gray-600">Полное имя (Telegram):</span>
                          <span className="font-medium text-gray-900">
                            {[profile.participant.first_name, profile.participant.last_name].filter(Boolean).join(' ')}
                          </span>
                        </div>
                      )}
                      
                      {/* Последняя активность */}
                      {profile.participant.last_activity_at && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-gray-600">Последняя активность:</span>
                          <span className="font-medium text-gray-900">
                            {new Date(profile.participant.last_activity_at).toLocaleString('ru')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Bio */}
                {profile.participant?.bio && (
                  <div className="border-t pt-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">О себе</h3>
                    <p className="text-sm text-gray-600">{profile.participant.bio}</p>
                  </div>
                )}

                {/* Contact Information */}
                {(profile.participant?.email || profile.participant?.phone) && (
                  <div className="border-t pt-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Контактная информация</h3>
                    <div className="space-y-2">
                      {profile.participant.email && (
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="h-4 w-4 text-gray-400" />
                          <span className="text-gray-600">Email:</span>
                          <span className="font-medium text-gray-900">{profile.participant.email}</span>
                        </div>
                      )}
                      {profile.participant.phone && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-gray-400">📞</span>
                          <span className="text-gray-600">Телефон:</span>
                          <span className="font-medium text-gray-900">{profile.participant.phone}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Custom attributes */}
                {profile.participant?.custom_attributes && Object.keys(profile.participant.custom_attributes).length > 0 && (
                  <div className="border-t pt-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Дополнительные атрибуты</h3>
                    <div className="space-y-2">
                      {Object.entries(profile.participant.custom_attributes).map(([key, value]) => (
                        <div key={key} className="flex items-start gap-2 text-sm">
                          <span className="text-gray-600 capitalize">{key}:</span>
                          <span className="font-medium text-gray-900 flex-1">
                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Admin groups */}
                {profile.membership.admin_groups && profile.membership.admin_groups.length > 0 && (
                  <div className="border-t pt-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">
                      Администратор в группах ({profile.membership.admin_groups.length})
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {profile.membership.admin_groups.map((group) => (
                        <span
                          key={group.id}
                          className="inline-flex items-center px-2 py-1 rounded-md text-sm bg-white border border-neutral-200 text-neutral-700"
                        >
                          {group.title}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Email Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email аккаунт
            </CardTitle>
          </CardHeader>
          <CardContent>
            {profile.user.email ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Email:</span>
                  <span className="font-medium">{profile.user.email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Статус:</span>
                  {profile.user.email_confirmed ? (
                    <span className="text-sm text-green-600 flex items-center gap-1">
                      <span className="inline-block w-2 h-2 bg-green-600 rounded-full"></span>
                      Подтвержден
                    </span>
                  ) : (
                    <span className="text-sm text-amber-600 flex items-center gap-1">
                      <span className="inline-block w-2 h-2 bg-amber-600 rounded-full"></span>
                      Не подтвержден
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-amber-600 mb-4">⚠️ Email не привязан</p>
                <p className="text-sm text-gray-600 mb-4">
                  Для получения полного доступа добавьте и подтвердите email адрес.
                </p>
                <Button onClick={() => setShowEmailForm(true)}>
                  Добавить email
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Telegram Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Telegram аккаунт в этой организации
            </CardTitle>
          </CardHeader>
          <CardContent>
            {profile.telegram ? (
              <div className="space-y-3">
                {profile.telegram.telegram_username && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Username:</span>
                    <span className="font-medium">@{profile.telegram.telegram_username}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">User ID:</span>
                  <span className="font-medium">{profile.telegram.telegram_user_id}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Статус:</span>
                  {profile.telegram.is_verified ? (
                    <span className="text-sm text-green-600 flex items-center gap-1">
                      <span className="inline-block w-2 h-2 bg-green-600 rounded-full"></span>
                      Верифицирован {profile.telegram.verified_at && `(${new Date(profile.telegram.verified_at).toLocaleDateString('ru')})`}
                    </span>
                  ) : (
                    <span className="text-sm text-amber-600 flex items-center gap-1">
                      <span className="inline-block w-2 h-2 bg-amber-600 rounded-full"></span>
                      Требуется верификация
                    </span>
                  )}
                </div>

                {!profile.telegram.is_verified && (
                  <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-800 mb-3">
                      Введите код из сообщения бота @orbo_assistant_bot:
                    </p>
                    {telegramError && (
                      <div className="bg-red-50 border border-red-200 rounded p-2 text-sm text-red-800 mb-3">
                        {telegramError}
                      </div>
                    )}
                    {telegramSuccess && (
                      <div className="bg-green-50 border border-green-200 rounded p-2 text-sm text-green-800 mb-3">
                        {telegramSuccess}
                      </div>
                    )}
                    <Input
                      type="text"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      placeholder="Введите код"
                      className="mb-3"
                      disabled={verifying}
                    />
                    <Button
                      onClick={handleVerifyTelegram}
                      disabled={verifying || !verificationCode}
                      className="w-full"
                    >
                      {verifying ? 'Верификация...' : 'Верифицировать'}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div>
                {!showTelegramForm ? (
                  <div className="text-center py-4">
                    <p className="text-gray-600 mb-4">Telegram не привязан</p>
                    <Button onClick={() => setShowTelegramForm(true)}>
                      Привязать Telegram
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
                      <p className="font-medium text-blue-900 mb-2">Как узнать Telegram User ID:</p>
                      <ol className="list-decimal list-inside space-y-1 text-blue-800">
                        <li>Откройте бота @orbo_assistant_bot</li>
                        <li>Отправьте команду /start</li>
                        <li>Бот пришлет ваш User ID</li>
                        <li>Скопируйте ID и вставьте ниже</li>
                      </ol>
                    </div>

                    {telegramError && (
                      <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
                        {telegramError}
                      </div>
                    )}
                    {telegramSuccess && (
                      <div className="bg-green-50 border border-green-200 rounded p-3 text-sm text-green-800">
                        {telegramSuccess}
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Telegram User ID
                      </label>
                      <Input
                        type="text"
                        value={telegramUserId}
                        onChange={(e) => setTelegramUserId(e.target.value)}
                        placeholder="Введите ваш Telegram User ID"
                        disabled={savingTelegram}
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={handleLinkTelegram}
                        disabled={savingTelegram || !telegramUserId}
                        className="flex-1"
                      >
                        {savingTelegram ? 'Сохранение...' : 'Привязать'}
                      </Button>
                      <Button
                        onClick={() => {
                          setShowTelegramForm(false)
                          setTelegramUserId('')
                          setTelegramError(null)
                          setTelegramSuccess(null)
                        }}
                        variant="outline"
                      >
                        Отмена
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

    </div>
  )
}

