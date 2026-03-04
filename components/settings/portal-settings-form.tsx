'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
}

interface Props {
  organizationId: string
  initialSettings: PortalSettings
  userRole: 'owner' | 'admin'
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

export default function PortalSettingsForm({ organizationId, initialSettings, userRole }: Props) {
  const [settings, setSettings] = useState<PortalSettings>(initialSettings)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const isOwner = userRole === 'owner'

  const handleSave = async () => {
    setIsSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/organizations/${organizationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Не удалось сохранить' })
      } else {
        setMessage({ type: 'success', text: 'Настройки сохранены' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Ошибка сети' })
    } finally {
      setIsSaving(false)
    }
  }

  const set = (key: keyof PortalSettings) => (value: boolean | string | null) =>
    setSettings((prev) => ({ ...prev, [key]: value }))

  return (
    <div className="space-y-6">
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
