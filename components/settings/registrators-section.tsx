'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Copy, Check, Link2, Trash2, UserCheck, RefreshCw, ChevronDown } from 'lucide-react'

interface Registrator {
  id: string
  name: string
  activated_at: string
  last_used_at: string | null
}

interface InviteInfo {
  id: string
  isActive: boolean
  url: string | null
  createdAt: string
}

export default function RegistratorsSection({ orgId }: { orgId: string }) {
  const [invite, setInvite] = useState<InviteInfo | null>(null)
  const [registrators, setRegistrators] = useState<Registrator[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  const loadData = async () => {
    try {
      const res = await fetch(`/api/organizations/${orgId}/registrators`)
      if (res.ok) {
        const data = await res.json()
        setInvite(data.invite)
        setRegistrators(data.registrators || [])
      }
    } catch {} finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [orgId])

  const handleCreate = async () => {
    setCreating(true)
    try {
      const res = await fetch(`/api/organizations/${orgId}/registrators`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setInvite(data.invite)
        setRegistrators([]) // old sessions revoked
      }
    } catch {} finally {
      setCreating(false)
    }
  }

  const handleDeactivate = async () => {
    if (!confirm('Деактивировать ссылку? Все текущие регистраторы потеряют доступ.')) return
    try {
      const res = await fetch(`/api/organizations/${orgId}/registrators`, { method: 'DELETE' })
      if (res.ok) {
        setInvite(invite ? { ...invite, isActive: false, url: null } : null)
        setRegistrators([])
      }
    } catch {}
  }

  const handleRevoke = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/organizations/${orgId}/registrators/${sessionId}`, { method: 'DELETE' })
      if (res.ok) {
        setRegistrators(prev => prev.filter(r => r.id !== sessionId))
      }
    } catch {}
  }

  const handleCopy = async () => {
    if (!invite?.url) return
    await navigator.clipboard.writeText(invite.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const formatDate = (s: string) => {
    try {
      return new Date(s).toLocaleString('ru-RU', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
      })
    } catch { return s }
  }

  if (loading) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <UserCheck className="w-5 h-5" />
          Регистраторы на мероприятиях
        </CardTitle>
        <p className="text-sm text-gray-500 mt-1">
          Дайте доступ к сканированию QR-кодов временным сотрудникам на входе, без доступа к пространству.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Collapsible instructions */}
        <button
          type="button"
          onClick={() => setShowHelp(!showHelp)}
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 transition-colors"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${showHelp ? 'rotate-180' : ''}`} />
          Как это работает?
        </button>
        {showHelp && (
          <div className="text-sm text-gray-600 space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div>
              <div className="font-medium text-gray-800 mb-1">Для организатора:</div>
              <ol className="list-decimal ml-4 space-y-1">
                <li>Нажмите «Создать ссылку-приглашение» ниже</li>
                <li>Скопируйте ссылку и отправьте сотрудникам, которые будут встречать гостей</li>
                <li>Одной ссылкой может воспользоваться несколько человек</li>
              </ol>
            </div>
            <div>
              <div className="font-medium text-gray-800 mb-1">Для регистратора:</div>
              <ol className="list-decimal ml-4 space-y-1">
                <li>Переходит по ссылке и вводит своё имя</li>
                <li>Попадает на страницу сканирования QR-кодов</li>
                <li>Сканирует QR-код участника и подтверждает проход</li>
              </ol>
            </div>
            <div>
              <div className="font-medium text-gray-800 mb-1">Доступ регистратора:</div>
              <ul className="list-disc ml-4 space-y-1">
                <li>Может только проверять QR-коды и подтверждать проход</li>
                <li>Не видит содержимое пространства, участников, события или настройки</li>
                <li>Регистрация и аккаунт в Orbo не требуются</li>
              </ul>
            </div>
            <div>
              <div className="font-medium text-gray-800 mb-1">Управление доступом:</div>
              <ul className="list-disc ml-4 space-y-1">
                <li><strong>Отозвать</strong> конкретного регистратора — он сразу теряет доступ к сканированию</li>
                <li><strong>Деактивировать ссылку</strong> — все текущие регистраторы теряют доступ, новые не смогут подключиться</li>
                <li><strong>Перегенерировать</strong> — старая ссылка перестаёт работать, создаётся новая. Все сессии сбрасываются</li>
              </ul>
            </div>
          </div>
        )}
        {/* Invite link */}
        {invite?.isActive && invite.url ? (
          <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <Link2 className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <input
              type="text"
              value={invite.url}
              readOnly
              className="flex-1 text-sm bg-transparent border-none outline-none text-blue-800 truncate"
            />
            <Button variant="outline" size="sm" onClick={handleCopy} className="flex-shrink-0">
              {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {!invite || !invite.isActive ? (
            <Button size="sm" onClick={handleCreate} disabled={creating}>
              <Link2 className="w-4 h-4 mr-2" />
              {creating ? 'Создание...' : 'Создать ссылку-приглашение'}
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={handleCreate} disabled={creating}>
                <RefreshCw className="w-4 h-4 mr-2" />
                {creating ? 'Обновление...' : 'Перегенерировать ссылку'}
              </Button>
              <Button size="sm" variant="outline" onClick={handleDeactivate} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                Деактивировать
              </Button>
            </>
          )}
        </div>

        {/* Active registrators list */}
        {registrators.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <div className="text-xs text-gray-500 font-medium">
              Активные регистраторы ({registrators.length})
            </div>
            {registrators.map(r => (
              <div key={r.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="text-sm font-medium text-gray-900">{r.name}</div>
                  <div className="text-xs text-gray-500">
                    Подключён {formatDate(r.activated_at)}
                    {r.last_used_at && ` · Активен ${formatDate(r.last_used_at)}`}
                  </div>
                </div>
                <button
                  onClick={() => handleRevoke(r.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors p-1"
                  title="Отозвать доступ"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
