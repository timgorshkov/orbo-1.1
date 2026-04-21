'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ParticipantAvatar } from '@/components/members/participant-avatar'
import { Crown, Shield, User, Mail, MessageSquare, LogOut, Edit2, Save, X, CheckCircle2, Copy, Check, ExternalLink } from 'lucide-react'
import { createClientLogger } from '@/lib/logger'

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
  maxAccount: {
    id: string
    max_user_id: number
    max_username: string | null
    max_first_name: string | null
    max_last_name: string | null
    is_verified: boolean
    verified_at: string | null
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
    max_user_id: number | null
    participant_status: string
    source: string | null
    last_activity_at: string | null
    announcements_consent_granted_at: string | null
    announcements_consent_revoked_at: string | null
  } | null
  organization: {
    id: string
    name: string
    logo_url: string | null
  } | null
}

export default function ProfilePage() {
  const router = useRouter()
  const params = useParams()
  const org = params?.org as string
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // Editing state
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [revokingConsent, setRevokingConsent] = useState(false)
  const [editForm, setEditForm] = useState({
    full_name: '',
    bio: '',
    phone: '',
    custom_attributes: {} as Record<string, any>
  })
  
  // Custom attributes as array (to avoid losing focus when editing keys)
  const [customAttributesArray, setCustomAttributesArray] = useState<Array<{ id: string; key: string; value: string }>>([])
  
  // System fields that shouldn't be edited manually (AI-generated or technical)
  const systemFields = [
    // AI-extracted fields
    'interests_keywords', 'recent_asks', 'city_inferred', 'city_confidence',
    'topics_discussed', 'behavioral_role', 'role_confidence', 'reaction_patterns',
    'communication_style',
    // User-defined fields (shown in "Goals & Offers" section separately)
    'goals_self', 'offers', 'asks', 'city_confirmed', 'bio_custom',
    // Technical/meta fields (should only be in logs)
    'last_enriched_at', 'enrichment_source', 'enrichment_version', 
    'cost_estimate_usd', 'tokens_used', 'cost_usd', 'analysis_date',
    'ai_analysis_cost', 'ai_analysis_tokens', // Additional AI cost fields
    // Event behavior (shown in separate section)
    'event_attendance',
    // Import metadata (hidden)
    'whatsapp_imported', 'import_date'
  ];
  
  // Convert custom_attributes object to array for editing (excluding system fields)
  const attributesToArray = (attrs: Record<string, any>) => {
    return Object.entries(attrs)
      .filter(([key]) => !systemFields.includes(key)) // Filter out system fields
      .map(([key, value]) => ({
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

  // Telegram linking state (6-digit code flow for participants)
  const [tgLinkCode, setTgLinkCode] = useState<string | null>(null)
  const [tgLinkBotUsername, setTgLinkBotUsername] = useState(
    process.env.NEXT_PUBLIC_TELEGRAM_REGISTRATION_BOT_USERNAME || 'orbo_start_bot'
  )
  const [tgLinkStatus, setTgLinkStatus] = useState<'idle' | 'generating' | 'waiting' | 'linked' | 'error'>('idle')
  const [tgLinkError, setTgLinkError] = useState<string | null>(null)
  const [tgMergedName, setTgMergedName] = useState<string | null>(null)
  const [tgCodeCopied, setTgCodeCopied] = useState(false)
  const tgPollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tgPollCount = useRef(0)

  // MAX account state
  const [maxVerificationCode, setMaxVerificationCode] = useState('')
  const [maxError, setMaxError] = useState<string | null>(null)
  const [maxSuccess, setMaxSuccess] = useState<string | null>(null)
  const [verifyingMax, setVerifyingMax] = useState(false)

  // Email activation state (for shadow profiles)
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [activationEmail, setActivationEmail] = useState('')
  const [activationCode, setActivationCode] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null)
  const [sendingCode, setSendingCode] = useState(false)
  const [activating, setActivating] = useState(false)

  useEffect(() => {
    if (org) {
      fetchProfile()
    }
    return () => { if (tgPollTimer.current) clearTimeout(tgPollTimer.current) }
  }, [org])

  const fetchProfile = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/user/profile?orgId=${org}`)
      const data = await response.json()

      if (!response.ok) {
        if (response.status === 401) {
          router.replace(`/p/${org}/auth`)
          return
        }
        throw new Error(data.error || 'Failed to fetch profile')
      }

      setProfile(data.profile)
      
      // Initialize edit form
      const logger = createClientLogger('ProfilePage', { org });
      logger.debug({
        has_participant: !!data.profile.participant,
        participant_id: data.profile.participant?.id
      }, 'Profile loaded');
      
      if (data.profile.participant) {
        const attrs = data.profile.participant.custom_attributes || {}
        setEditForm({
          full_name: data.profile.participant.full_name || '',
          bio: data.profile.participant.bio || '',
          phone: data.profile.participant.phone || '',
          custom_attributes: attrs
        })
        setCustomAttributesArray(attributesToArray(attrs))
        logger.debug({
          has_full_name: !!data.profile.participant.full_name,
          has_bio: !!data.profile.participant.bio,
          has_phone: !!data.profile.participant.phone,
          custom_attrs_count: Object.keys(attrs).length
        }, 'Edit form initialized');
      } else {
        logger.warn({ org }, 'No participant data found in profile');
      }
    } catch (e: any) {
      const logger = createClientLogger('ProfilePage', { org });
      logger.error({
        error: e.message,
        stack: e.stack,
        org
      }, 'Error fetching profile');
      setError(e.message || 'Failed to fetch profile')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveProfile = async () => {
    setSaving(true)
    setError(null)
    try {
      // Preserve system fields from original custom_attributes
      const originalAttrs = profile?.participant?.custom_attributes || {};
      const systemFieldsToPreserve: Record<string, any> = {};
      
      systemFields.forEach(field => {
        if (originalAttrs[field] !== undefined) {
          systemFieldsToPreserve[field] = originalAttrs[field];
        }
      });
      
      // Merge system fields with user-edited attributes
      const dataToSave = {
        ...editForm,
        custom_attributes: {
          ...systemFieldsToPreserve, // Keep system fields
          ...arrayToAttributes(customAttributesArray) // Add user-edited fields
        }
      }
      
      const response = await fetch(`/api/user/profile?orgId=${org}`, {
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
      const logger = createClientLogger('ProfilePage', { org });
      logger.error({
        error: e.message,
        stack: e.stack,
        org
      }, 'Error saving profile');
      setError(e.message || 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  const handleRevokeAnnouncementsConsent = async () => {
    if (!profile?.participant?.id) return
    setRevokingConsent(true)
    try {
      const res = await fetch(`/api/user/profile/revoke-announcements-consent?orgId=${org}`, {
        method: 'POST',
      })
      if (res.ok) {
        setProfile(prev => prev ? {
          ...prev,
          participant: prev.participant ? {
            ...prev.participant,
            announcements_consent_revoked_at: new Date().toISOString(),
          } : null,
        } : null)
      }
    } catch { /* ignore */ }
    setRevokingConsent(false)
  }

  const handleLogout = async () => {
    if (confirm('Вы уверены, что хотите выйти?')) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        })
      } catch (error) {
        const logger = createClientLogger('ProfilePage', { org });
        logger.error({
          error: error instanceof Error ? error.message : String(error),
          org
        }, 'Logout error');
      }
      window.location.href = `/p/${org}/auth`
    }
  }

  const startTgLink = async () => {
    setTgLinkStatus('generating')
    setTgLinkError(null)
    setTgMergedName(null)
    if (tgPollTimer.current) clearTimeout(tgPollTimer.current)
    tgPollCount.current = 0

    try {
      const res = await fetch('/api/participant-auth/telegram-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: org }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Не удалось создать код')

      setTgLinkCode(data.code)
      if (data.botUsername) setTgLinkBotUsername(data.botUsername)
      setTgLinkStatus('waiting')
      scheduleTgPoll(data.code)
    } catch (e: any) {
      setTgLinkStatus('error')
      setTgLinkError(e.message || 'Ошибка генерации кода')
    }
  }

  const scheduleTgPoll = (code: string) => {
    const MAX_POLLS = 72 // 3 minutes
    const tick = async () => {
      tgPollCount.current++
      if (tgPollCount.current > MAX_POLLS) {
        setTgLinkStatus('error')
        setTgLinkError('Время ожидания истекло. Попробуйте снова.')
        return
      }
      try {
        const res = await fetch(`/api/auth/telegram-code/status?code=${code}`)
        if (res.ok) {
          const data = await res.json()
          if (data.linked) {
            // Finalize: update participant.tg_user_id, handle merge
            const finalRes = await fetch(`/api/participant-auth/telegram-link?code=${code}`)
            const finalData = await finalRes.json()
            if (finalRes.ok && finalData.linked) {
              setTgLinkStatus('linked')
              if (finalData.merged && finalData.conflictName) {
                setTgMergedName(finalData.conflictName)
              }
              await fetchProfile()
              return
            }
          }
        }
      } catch { /* retry */ }
      tgPollTimer.current = setTimeout(tick, 2500)
    }
    tgPollTimer.current = setTimeout(tick, 2500)
  }

  const handleVerifyMax = async () => {
    if (!maxVerificationCode) {
      setMaxError('Пожалуйста, введите код верификации')
      return
    }
    setVerifyingMax(true)
    setMaxError(null)
    setMaxSuccess(null)
    try {
      const response = await fetch('/api/max/accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: org, verificationCode: maxVerificationCode })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Ошибка верификации')
      setMaxSuccess('MAX-аккаунт успешно верифицирован!')
      setMaxVerificationCode('')
      await fetchProfile()
    } catch (e: any) {
      setMaxError(e.message || 'Ошибка верификации')
    } finally {
      setVerifyingMax(false)
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
      const logger = createClientLogger('ProfilePage', { org });
      logger.error({
        error: e.message,
        stack: e.stack,
        org,
        email: activationEmail
      }, 'Error sending activation code');
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
      const logger = createClientLogger('ProfilePage', { org });
      logger.error({
        error: e.message,
        stack: e.stack,
        org,
        email: activationEmail
      }, 'Error activating profile');
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

  // Display name priority:
  // 1. User's email (this is the logged-in user's identity)
  // 2. Telegram name from verified account
  // 3. Participant data (might belong to a different user if Telegram was shared)
  const displayName = profile.participant?.full_name ||
                      [profile.telegram?.telegram_first_name, profile.telegram?.telegram_last_name].filter(Boolean).join(' ') ||
                      profile.user.email ||
                      (profile.participant?.username ? `@${profile.participant.username}` : null) ||
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
            в организации {profile.organization?.name}
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
                  enableSync
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
                      const logger = createClientLogger('ProfilePage', { org });
                      logger.debug({
                        has_full_name: !!profile.participant.full_name,
                        has_bio: !!profile.participant.bio,
                        has_phone: !!profile.participant.phone,
                        custom_attrs_count: Object.keys(attrs).length
                      }, 'Edit mode activated, form initialized');
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
                
                {/* Goals & Offers (user-editable) */}
                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Цели и Предложения</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        Мои цели
                      </label>
                      <textarea
                        value={editForm.custom_attributes.goals_self || ''}
                        onChange={(e) => setEditForm({
                          ...editForm,
                          custom_attributes: {
                            ...editForm.custom_attributes,
                            goals_self: e.target.value
                          }
                        })}
                        placeholder="Опишите ваши цели и интересы в сообществе"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        Могу предложить (через запятую)
                      </label>
                      <Input
                        type="text"
                        value={Array.isArray(editForm.custom_attributes.offers) 
                          ? editForm.custom_attributes.offers.join(', ')
                          : editForm.custom_attributes.offers || ''}
                        onChange={(e) => setEditForm({
                          ...editForm,
                          custom_attributes: {
                            ...editForm.custom_attributes,
                            offers: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                          }
                        })}
                        placeholder="Консультации, знакомства, ресурсы..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        Ищу (через запятую)
                      </label>
                      <Input
                        type="text"
                        value={Array.isArray(editForm.custom_attributes.asks) 
                          ? editForm.custom_attributes.asks.join(', ')
                          : editForm.custom_attributes.asks || ''}
                        onChange={(e) => setEditForm({
                          ...editForm,
                          custom_attributes: {
                            ...editForm.custom_attributes,
                            asks: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                          }
                        })}
                        placeholder="Партнёры, инвестиции, специалисты..."
                      />
                    </div>
                  </div>
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
              <div className="space-y-2">
                {/* Bio */}
                {profile.participant?.bio && (
                  <p className="text-base text-gray-700 mb-2">{profile.participant.bio}</p>
                )}

                {/* ─── Контакты (стиль карточки участника) ─── */}
                <div className="space-y-2">
                  {/* Telegram */}
                  <div className="flex items-center gap-3">
                    <svg className="h-4 w-4 text-[#2AABEE] flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18.717-.962 3.928-1.36 5.214-.168.543-.5.725-.819.743-.695.03-1.223-.46-1.895-.9-1.054-.69-1.648-1.12-2.671-1.795-1.182-.78-.416-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212-.07-.062-.174-.041-.248-.024-.106.024-1.793 1.14-5.062 3.345-.479.331-.913.492-1.302.484-.428-.01-1.252-.242-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.324-.437.892-.663 3.498-1.524 5.831-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635.099-.001.321.023.465.14.121.099.155.232.171.325.016.094.036.308.02.475z"/>
                    </svg>
                    <span className="text-sm text-gray-500 w-20">Telegram</span>
                    <div className="flex-1 flex items-center gap-2">
                      {profile.participant?.username ? (
                        <a href={`https://t.me/${profile.participant.username}`} target="_blank" rel="noopener noreferrer"
                          className="text-sm font-medium text-blue-600 hover:underline">
                          @{profile.participant.username}
                        </a>
                      ) : profile.participant?.tg_user_id ? (
                        <span className="text-sm text-gray-400">Username не указан</span>
                      ) : (
                        <span className="text-sm text-gray-400">Не привязан</span>
                      )}
                      {profile.telegram?.is_verified ? (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-green-500 rounded-full" /> Верифицирован
                        </span>
                      ) : profile.participant?.tg_user_id ? (
                        <span className="text-xs text-amber-600 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" /> Не верифицирован
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* MAX */}
                  {(profile.maxAccount || profile.participant?.max_user_id) && (
                    <div className="flex items-center gap-3">
                      <MessageSquare className="h-4 w-4 text-purple-600 flex-shrink-0" />
                      <span className="text-sm text-gray-500 w-20">MAX</span>
                      <div className="flex-1 flex items-center gap-2">
                        {profile.maxAccount?.max_username ? (
                          <span className="text-sm font-medium text-purple-600">@{profile.maxAccount.max_username}</span>
                        ) : profile.maxAccount?.max_first_name ? (
                          <span className="text-sm font-medium text-purple-600">
                            {[profile.maxAccount.max_first_name, profile.maxAccount.max_last_name].filter(Boolean).join(' ')}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">Привязан</span>
                        )}
                        {profile.maxAccount?.is_verified ? (
                          <span className="text-xs text-green-600 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full" /> Верифицирован
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )}

                  {/* Email */}
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-green-600 flex-shrink-0" />
                    <span className="text-sm text-gray-500 w-20">Email</span>
                    <div className="flex-1 flex items-center gap-2">
                      {profile.user.email ? (
                        <span className="text-sm font-medium text-gray-900">{profile.user.email}</span>
                      ) : (
                        <span className="text-sm text-gray-400">Не указан</span>
                      )}
                      {profile.user.email && profile.user.email_confirmed ? (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-green-500 rounded-full" /> Подтверждён
                        </span>
                      ) : profile.user.email ? (
                        <span className="text-xs text-amber-600 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" /> Не подтверждён
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Phone */}
                  <div className="flex items-center gap-3">
                    <svg className="h-4 w-4 text-purple-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                    </svg>
                    <span className="text-sm text-gray-500 w-20">Телефон</span>
                    {profile.participant?.phone ? (
                      <a href={`tel:${profile.participant.phone}`} className="text-sm font-medium text-purple-600 hover:underline">
                        {profile.participant.phone}
                      </a>
                    ) : (
                      <span className="text-sm text-gray-400">Не указан</span>
                    )}
                  </div>
                </div>

                {/* ─── Goals & Offers (всегда показываем) ─── */}
                <div className="border-t pt-4 mt-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Цели и Предложения</h3>
                  {(() => {
                    const attrs = profile.participant?.custom_attributes || {}
                    const hasGoals = !!attrs.goals_self
                    const hasOffers = Array.isArray(attrs.offers) && attrs.offers.length > 0
                    const hasAsks = Array.isArray(attrs.asks) && attrs.asks.length > 0
                    if (!hasGoals && !hasOffers && !hasAsks) {
                      return (
                        <p className="text-sm text-gray-400 italic">
                          Не заполнены. Нажмите «Редактировать», чтобы рассказать о себе.
                        </p>
                      )
                    }
                    return (
                      <div className="space-y-3">
                        {attrs.goals_self && (
                          <div>
                            <span className="text-xs font-medium text-gray-500 uppercase">Цели</span>
                            <p className="text-sm text-gray-800 mt-1">{attrs.goals_self}</p>
                          </div>
                        )}
                        {hasOffers && (
                          <div>
                            <span className="text-xs font-medium text-gray-500 uppercase">Могу предложить</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {attrs.offers.map((offer: string, i: number) => (
                                <span key={i} className="px-2 py-1 bg-green-50 text-green-700 text-xs rounded-full">{offer}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {hasAsks && (
                          <div>
                            <span className="text-xs font-medium text-gray-500 uppercase">Ищу</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {attrs.asks.map((ask: string, i: number) => (
                                <span key={i} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">{ask}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>

                {/* ─── Дополнительные атрибуты (не системные) ─── */}
                {(() => {
                  const attrs = profile.participant?.custom_attributes || {}
                  const visibleAttrs = Object.entries(attrs)
                    .filter(([key]) => !systemFields.includes(key))
                  if (visibleAttrs.length === 0) return null
                  return (
                    <div className="border-t pt-4">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">Дополнительная информация</h3>
                      <div className="space-y-1.5">
                        {visibleAttrs.map(([key, value]) => (
                          <div key={key} className="flex items-start gap-2 text-sm">
                            <span className="text-gray-500 min-w-[100px]">{key}</span>
                            <span className="text-gray-900 font-medium">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}

                {/* ─── Группы ─── */}
                {profile.membership.admin_groups && profile.membership.admin_groups.length > 0 && (
                  <div className="border-t pt-4">
                    <h3 className="text-sm font-medium text-gray-500 mb-2">Группы</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.membership.admin_groups.map((group) => (
                        <span key={group.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-gray-100 text-gray-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          {group.title}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* ─── Согласия ─── */}
                {profile.participant?.announcements_consent_granted_at && (
                  <div className="border-t pt-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Согласия</h3>
                    <div className="flex items-center justify-between">
                      <div className="text-sm">
                        <span className="text-gray-600">Согласие на анонсы и рассылки: </span>
                        {profile.participant.announcements_consent_revoked_at ? (
                          <span className="text-orange-600 font-medium">Отозвано</span>
                        ) : (
                          <span className="text-green-600 font-medium">Действует</span>
                        )}
                      </div>
                      {!profile.participant.announcements_consent_revoked_at && (
                        <button
                          onClick={handleRevokeAnnouncementsConsent}
                          disabled={revokingConsent}
                          className="text-xs text-red-600 hover:text-red-700 underline disabled:opacity-50"
                        >
                          {revokingConsent ? 'Отзыв...' : 'Отозвать согласие'}
                        </button>
                      )}
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
              Telegram аккаунт
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Admin TG account (user_telegram_accounts) — for owners/admins syncing groups */}
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
              </div>

            ) : profile.participant?.tg_user_id ? (
              /* Participant TG identity linked (from group activity or previous linking) */
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="font-medium">Telegram подключён</span>
                </div>
                {profile.participant.username && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Username:</span>
                    <span className="font-medium">@{profile.participant.username}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">User ID:</span>
                  <span className="font-medium font-mono text-sm">{profile.participant.tg_user_id}</span>
                </div>
                {tgMergedName && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                    ✅ Профили объединены: история сообщений из профиля «{tgMergedName}» добавлена к вашему аккаунту.
                  </div>
                )}
              </div>

            ) : tgLinkStatus === 'linked' ? (
              /* Just linked in this session */
              <div className="flex items-center gap-2 text-green-700 py-2">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">Telegram успешно привязан!</span>
              </div>

            ) : tgLinkCode && tgLinkStatus !== 'idle' ? (
              /* 6-digit code flow active */
              <div className="space-y-4">
                <div className="flex items-center gap-1.5 flex-wrap text-sm text-gray-700">
                  <span>Откройте</span>
                  <span className="font-semibold">@{tgLinkBotUsername}</span>
                  <span>в Telegram и отправьте этот код:</span>
                </div>

                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex-1 font-mono text-2xl font-bold tracking-widest text-blue-700 select-all text-center">
                      {tgLinkCode}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(tgLinkCode).catch(() => {})
                        setTgCodeCopied(true)
                        setTimeout(() => setTgCodeCopied(false), 2000)
                      }}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-blue-200 hover:border-blue-400 text-blue-600 text-sm font-medium transition-colors"
                    >
                      {tgCodeCopied
                        ? <><Check className="w-4 h-4 text-green-500" /><span className="hidden sm:inline text-green-600">Скопировано</span></>
                        : <><Copy className="w-4 h-4" /><span className="hidden sm:inline">Копировать</span></>
                      }
                    </button>
                  </div>
                </div>

                <div className="text-center">
                  <a
                    href={`https://t.me/${tgLinkBotUsername}?start=${tgLinkCode}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-500 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Открыть бота в один клик
                  </a>
                </div>

                {tgLinkStatus === 'waiting' && (
                  <p className="text-xs text-gray-500 text-center">Ожидаем подтверждение от бота...</p>
                )}
                {tgLinkError && (
                  <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
                    {tgLinkError}
                  </div>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (tgPollTimer.current) clearTimeout(tgPollTimer.current)
                    setTgLinkCode(null)
                    setTgLinkStatus('idle')
                    setTgLinkError(null)
                  }}
                >
                  Отмена
                </Button>
              </div>

            ) : (
              /* No TG linked yet — show connect button */
              <div className="text-center py-4">
                <p className="text-gray-600 mb-1">Telegram не привязан</p>
                <p className="text-xs text-gray-400 mb-4">
                  Привяжите Telegram, чтобы ваш профиль объединился с историей сообщений в группе.
                </p>
                {tgLinkError && (
                  <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800 mb-3">
                    {tgLinkError}
                  </div>
                )}
                <Button
                  onClick={startTgLink}
                  disabled={tgLinkStatus === 'generating'}
                >
                  {tgLinkStatus === 'generating' ? 'Генерация кода...' : 'Привязать Telegram'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* MAX Section — only for owners/admins */}
        {profile.membership.role !== 'member' && <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-indigo-600" />
              MAX аккаунт в этой организации
            </CardTitle>
          </CardHeader>
          <CardContent>
            {profile.maxAccount ? (
              <div className="space-y-3">
                {profile.maxAccount.max_username && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Username:</span>
                    <span className="font-medium">@{profile.maxAccount.max_username}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">User ID:</span>
                  <span className="font-medium">{profile.maxAccount.max_user_id}</span>
                </div>
                {(profile.maxAccount.max_first_name || profile.maxAccount.max_last_name) && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Имя:</span>
                    <span className="font-medium">
                      {[profile.maxAccount.max_first_name, profile.maxAccount.max_last_name].filter(Boolean).join(' ')}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Статус:</span>
                  {profile.maxAccount.is_verified ? (
                    <span className="text-sm text-green-600 flex items-center gap-1">
                      <span className="inline-block w-2 h-2 bg-green-600 rounded-full"></span>
                      Верифицирован {profile.maxAccount.verified_at && `(${new Date(profile.maxAccount.verified_at).toLocaleDateString('ru')})`}
                    </span>
                  ) : (
                    <span className="text-sm text-amber-600 flex items-center gap-1">
                      <span className="inline-block w-2 h-2 bg-amber-600 rounded-full"></span>
                      Требуется верификация
                    </span>
                  )}
                </div>

                {!profile.maxAccount.is_verified && (
                  <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-800 mb-3">
                      Введите код верификации из MAX-бота:
                    </p>
                    {maxError && (
                      <div className="bg-red-50 border border-red-200 rounded p-2 text-sm text-red-800 mb-3">
                        {maxError}
                      </div>
                    )}
                    {maxSuccess && (
                      <div className="bg-green-50 border border-green-200 rounded p-2 text-sm text-green-800 mb-3">
                        {maxSuccess}
                      </div>
                    )}
                    <Input
                      type="text"
                      value={maxVerificationCode}
                      onChange={(e) => setMaxVerificationCode(e.target.value.toUpperCase())}
                      placeholder="Например: A1B2C3D4"
                      maxLength={8}
                      className="mb-3"
                      disabled={verifyingMax}
                    />
                    <Button
                      onClick={handleVerifyMax}
                      disabled={verifyingMax || !maxVerificationCode}
                      className="w-full"
                    >
                      {verifyingMax ? 'Верификация...' : 'Верифицировать'}
                    </Button>
                    <p className="text-xs text-gray-500 mt-2">
                      Для получения кода перейдите в{' '}
                      <a href={`/p/${org}/telegram/max`} className="text-blue-600 hover:underline">
                        настройки MAX
                      </a>
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-gray-600 mb-4">MAX-аккаунт не привязан</p>
                <p className="text-sm text-gray-500 mb-4">
                  Привяжите MAX-аккаунт для управления MAX-группами организации.
                </p>
                <Button variant="outline" onClick={() => router.push(`/p/${org}/telegram/max`)}>
                  Привязать MAX-аккаунт
                </Button>
              </div>
            )}
          </CardContent>
        </Card>}

    </div>
  )
}

