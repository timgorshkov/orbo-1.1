'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import dynamic from 'next/dynamic'

// Тот же редактор, что и в описании событий
const TelegramRichEditor = dynamic(() => import('@/components/ui/telegram-rich-editor'), {
  ssr: false,
  loading: () => <div className="h-40 rounded-lg border border-gray-200 bg-gray-50 animate-pulse" />,
})

interface PortalSettings {
  portal_show_events: boolean
  portal_show_members: boolean
  portal_show_materials: boolean
  portal_show_apps: boolean
  portal_welcome_html: string | null
  portal_cover_url: string | null
  public_description: string | null
  telegram_group_link: string | null
  collect_pd_consent: boolean
  collect_announcements_consent: boolean
  privacy_policy_html: string | null
}

interface OrganizationInfo {
  id: string
  name: string
  slug: string
  logo_url: string | null
}

interface Props {
  organizationId: string
  initialSettings: PortalSettings
  userRole: 'owner' | 'admin'
  organization?: OrganizationInfo
}

interface ToggleRowProps {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}

function ToggleRow({ label, description, checked, onChange, disabled }: ToggleRowProps) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-3 border-b border-neutral-100 last:border-0">
      <div className="pt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="h-4 w-4 rounded border-neutral-300 accent-blue-600 disabled:cursor-not-allowed"
        />
      </div>
      <div>
        <div className="font-medium text-neutral-900 text-sm">{label}</div>
        <div className="text-xs text-neutral-500 mt-0.5">{description}</div>
      </div>
    </label>
  )
}

export default function PortalSettingsForm({ organizationId, initialSettings, userRole, organization }: Props) {
  const [settings, setSettings] = useState<PortalSettings>(initialSettings)
  const [savedSettings, setSavedSettings] = useState<PortalSettings>(initialSettings)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [isUploadingCover, setIsUploadingCover] = useState(false)
  const coverInputRef = useRef<HTMLInputElement>(null)

  // Organization name & logo state
  const [orgName, setOrgName] = useState(organization?.name || '')
  const [logoUrl, setLogoUrl] = useState(organization?.logo_url || null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [isSavingOrg, setIsSavingOrg] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  const isOwner = userRole === 'owner'

  // --- Unsaved changes detection ---
  const isOrgDirty = organization
    ? orgName.trim() !== organization.name || !!logoFile
    : false

  const isPortalDirty = useMemo(() => {
    const keys = Object.keys(savedSettings) as (keyof PortalSettings)[]
    return keys.some(k => {
      // skip cover — it saves separately
      if (k === 'portal_cover_url') return false
      const saved = savedSettings[k]
      const current = settings[k]
      // treat null/undefined/'' as equal
      if (!saved && !current) return false
      return saved !== current
    })
  }, [settings, savedSettings])

  const isDirty = isOrgDirty || isPortalDirty

  // Browser-level navigation (close tab, refresh, external URL)
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  // Client-side navigation (Next.js router.push → tab switching, sidebar links)
  useEffect(() => {
    if (!isDirty) return

    const originalPushState = window.history.pushState.bind(window.history)

    window.history.pushState = function (data: any, unused: string, url?: string | URL | null) {
      const confirmed = window.confirm('У вас есть несохранённые изменения. Покинуть страницу?')
      if (!confirmed) return
      return originalPushState.call(this, data, unused, url)
    }

    return () => {
      window.history.pushState = originalPushState
    }
  }, [isDirty])

  const handleSave = async () => {
    setIsSaving(true)
    setMessage(null)
    try {
      const { portal_cover_url, ...patchBody } = settings
      const res = await fetch(`/api/organizations/${organizationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Не удалось сохранить' })
      } else {
        setSavedSettings({ ...settings })
        setMessage({ type: 'success', text: 'Настройки сохранены' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Ошибка сети' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleCoverFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setMessage({ type: 'error', text: 'Только JPG, PNG и WebP файлы разрешены' })
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Размер файла должен быть меньше 10MB' })
      return
    }

    setCoverFile(file)
    const reader = new FileReader()
    reader.onloadend = () => setCoverPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleUploadCover = async () => {
    if (!coverFile) return
    setIsUploadingCover(true)
    setMessage(null)
    try {
      const formData = new FormData()
      formData.append('file', coverFile)
      const res = await fetch(`/api/organizations/${organizationId}/cover`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Не удалось загрузить обложку' })
      } else {
        setSettings((prev) => ({ ...prev, portal_cover_url: data.cover_url }))
        setCoverFile(null)
        setCoverPreview(null)
        setMessage({ type: 'success', text: 'Обложка загружена' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Ошибка сети' })
    } finally {
      setIsUploadingCover(false)
    }
  }

  const handleDeleteCover = async () => {
    setIsUploadingCover(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/organizations/${organizationId}/cover`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Не удалось удалить обложку' })
      } else {
        setSettings((prev) => ({ ...prev, portal_cover_url: null }))
        setCoverFile(null)
        setCoverPreview(null)
        setMessage({ type: 'success', text: 'Обложка удалена' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Ошибка сети' })
    } finally {
      setIsUploadingCover(false)
    }
  }

  const set = (key: keyof PortalSettings) => (value: boolean | string | null) =>
    setSettings((prev) => ({ ...prev, [key]: value }))

  // --- Organization name & logo handlers ---
  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setMessage({ type: 'error', text: 'Только JPG и PNG файлы разрешены' })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Размер файла должен быть меньше 5MB' })
      return
    }
    setLogoFile(file)
    setMessage(null)
    const reader = new FileReader()
    reader.onloadend = () => setLogoPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleRemoveLogo = async () => {
    setIsSavingOrg(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/organizations/${organizationId}/logo`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || 'Не удалось удалить логотип' })
      } else {
        setLogoUrl(null)
        setLogoPreview(null)
        setLogoFile(null)
        setMessage({ type: 'success', text: 'Логотип удалён' })
        setTimeout(() => window.location.reload(), 1000)
      }
    } catch {
      setMessage({ type: 'error', text: 'Ошибка сети' })
    } finally {
      setIsSavingOrg(false)
    }
  }

  const handleSaveOrg = async () => {
    if (!organization) return
    setIsSavingOrg(true)
    setMessage(null)
    try {
      let newLogoUrl = logoUrl
      if (logoFile) {
        const formData = new FormData()
        formData.append('file', logoFile)
        const uploadRes = await fetch(`/api/organizations/${organizationId}/logo`, {
          method: 'POST',
          body: formData,
        })
        if (!uploadRes.ok) {
          const data = await uploadRes.json()
          throw new Error(data.error || 'Не удалось загрузить логотип')
        }
        const uploadData = await uploadRes.json()
        newLogoUrl = uploadData.logo_url
        setLogoUrl(newLogoUrl)
      }
      if (orgName.trim() !== organization.name || logoFile) {
        const res = await fetch(`/api/organizations/${organizationId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: orgName.trim(), logo_url: newLogoUrl }),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Не удалось обновить настройки')
        }
      }
      setLogoFile(null)
      setLogoPreview(null)
      setMessage({ type: 'success', text: 'Основные настройки сохранены' })
      setTimeout(() => window.location.reload(), 1000)
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setIsSavingOrg(false)
    }
  }

  const currentLogo = logoPreview || logoUrl

  const currentCover = coverPreview || settings.portal_cover_url

  return (
    <div className="space-y-6">
      {/* Основные настройки (название + логотип) */}
      {organization && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Основные настройки</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Название пространства
              </label>
              <Input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                disabled={isSavingOrg}
                required
                className="max-w-md"
              />
              <p className="text-xs text-neutral-500 mt-1">
                URL: /app/{organization.slug}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Логотип
              </label>
              <p className="text-xs text-neutral-500 mb-2">
                Квадратное изображение, JPG или PNG, до 5MB
              </p>
              <div className="flex items-start gap-4">
                {currentLogo && (
                  <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-neutral-200">
                    <img src={currentLogo} alt="Логотип" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/jpeg,image/png"
                    onChange={handleLogoFileChange}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={isSavingOrg}
                  >
                    {currentLogo ? 'Изменить' : 'Загрузить логотип'}
                  </Button>
                  {currentLogo && !logoFile && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRemoveLogo}
                      disabled={isSavingOrg}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      Удалить
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div>
              <Button
                onClick={handleSaveOrg}
                disabled={isSavingOrg || (orgName.trim() === organization.name && !logoFile)}
                size="sm"
              >
                {isSavingOrg ? 'Сохранение...' : 'Сохранить'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Публичное описание */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Описание сообщества</CardTitle>
          <p className="text-sm text-neutral-500 mt-1">
            Отображается на публичной странице сообщества для всех посетителей.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Публичное описание
            </label>
            <textarea
              value={settings.public_description || ''}
              onChange={(e) => set('public_description')(e.target.value || null)}
              disabled={!isOwner}
              rows={3}
              placeholder="Расскажите о вашем сообществе..."
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Ссылка на Telegram-группу
            </label>
            <Input
              type="url"
              value={settings.telegram_group_link || ''}
              onChange={(e) => set('telegram_group_link')(e.target.value || null)}
              disabled={!isOwner}
              placeholder="https://t.me/yourcommunity"
              className="max-w-md"
            />
          </div>
        </CardContent>
      </Card>

      {/* Обложка */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Обложка портала</CardTitle>
          <p className="text-sm text-neutral-500 mt-1">
            Баннер на главной странице публичного портала. Рекомендуем JPG/PNG шириной от 1200px.
          </p>
        </CardHeader>
        <CardContent>
          {currentCover && (
            <div className="mb-3 rounded-lg overflow-hidden border border-neutral-200 max-w-lg">
              <img src={currentCover} alt="Обложка" className="w-full object-cover max-h-48" />
            </div>
          )}
          <input
            ref={coverInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleCoverFileChange}
            className="hidden"
          />
          {isOwner && (
            <div className="flex flex-wrap gap-2">
              {!coverFile ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => coverInputRef.current?.click()}
                  disabled={isUploadingCover}
                >
                  {currentCover ? 'Изменить обложку' : 'Загрузить обложку'}
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleUploadCover}
                  disabled={isUploadingCover}
                >
                  {isUploadingCover ? 'Загрузка...' : 'Сохранить обложку'}
                </Button>
              )}
              {coverFile && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setCoverFile(null); setCoverPreview(null) }}
                  disabled={isUploadingCover}
                >
                  Отмена
                </Button>
              )}
              {settings.portal_cover_url && !coverFile && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDeleteCover}
                  disabled={isUploadingCover}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  Удалить обложку
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Видимость разделов */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Разделы меню для участников</CardTitle>
          <p className="text-sm text-neutral-500 mt-1">
            Управляет отображением разделов в левом и мобильном меню для участников (и для
            владельца/админа в «режиме участника»). Прямой доступ по ссылке не ограничивается.
          </p>
        </CardHeader>
        <CardContent>
          <ToggleRow
            label="📅 События"
            description="Участники видят раздел «События» в меню и блок «Предстоящие события» на главной"
            checked={settings.portal_show_events}
            onChange={set('portal_show_events')}
            disabled={!isOwner}
          />
          <ToggleRow
            label="👥 Участники"
            description="Участники видят раздел «Участники» в меню и блок «Новые участники» на главной"
            checked={settings.portal_show_members}
            onChange={set('portal_show_members')}
            disabled={!isOwner}
          />
          <ToggleRow
            label="📚 Материалы"
            description="Участники видят раздел «Материалы» в меню и блок «Последние материалы» на главной"
            checked={settings.portal_show_materials}
            onChange={set('portal_show_materials')}
            disabled={!isOwner}
          />
          <ToggleRow
            label="⚡ Приложения"
            description="Участники видят раздел «Приложения» в меню и блок «Полезные приложения» на главной"
            checked={settings.portal_show_apps}
            onChange={set('portal_show_apps')}
            disabled={!isOwner}
          />
        </CardContent>
      </Card>

      {/* Приветственный блок */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Приветственный блок</CardTitle>
          <p className="text-sm text-neutral-500 mt-1">
            Если заполнен, отображается на главной странице выше всех остальных блоков.
            Можно использовать для вводного обращения, ссылок или правил сообщества.
          </p>
        </CardHeader>
        <CardContent>
          <TelegramRichEditor
            value={settings.portal_welcome_html || ''}
            onChange={(html) => set('portal_welcome_html')(html || null)}
            placeholder="Введите текст приветствия, правила сообщества или полезные ссылки..."
          />
          <p className="text-xs text-neutral-400 mt-2">
            Поддерживается форматирование: жирный, курсив, ссылки.
            Оставьте пустым, чтобы блок не отображался.
          </p>
        </CardContent>
      </Card>

      {/* Сбор согласий */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Сбор согласий</CardTitle>
          <p className="text-sm text-neutral-500 mt-1">
            При включении в форме регистрации на событие будут отображаться чекбоксы
            для сбора согласий от участников.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            label="Согласие на обработку ПД"
            description="Обязательный чекбокс в форме регистрации. Без него участник не сможет зарегистрироваться."
            checked={settings.collect_pd_consent}
            onChange={set('collect_pd_consent')}
            disabled={!isOwner}
          />
          <ToggleRow
            label="Согласие на получение анонсов"
            description="Необязательный чекбокс. Статус сохраняется в профиле участника, а не привязан к событию."
            checked={settings.collect_announcements_consent}
            onChange={set('collect_announcements_consent')}
            disabled={!isOwner}
          />

          {settings.collect_pd_consent && (
            <div className="pt-2">
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Политика обработки персональных данных
              </label>
              <p className="text-xs text-neutral-500 mb-2">
                Текст будет доступен по ссылке из чекбокса согласия. Обязателен при включённом сборе согласий.
              </p>
              <TelegramRichEditor
                value={settings.privacy_policy_html || ''}
                onChange={(html) => set('privacy_policy_html')(html || null)}
                placeholder="Введите текст политики обработки персональных данных..."
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Кнопка сохранения */}
      {isOwner && (
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Сохранение...' : 'Сохранить настройки'}
          </Button>
          {message && (
            <span
              className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}
            >
              {message.text}
            </span>
          )}
        </div>
      )}

      {!isOwner && (
        <p className="text-sm text-neutral-500">
          Только владелец может изменять настройки портала.
        </p>
      )}
    </div>
  )
}
