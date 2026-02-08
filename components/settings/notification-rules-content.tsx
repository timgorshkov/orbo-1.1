'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createClientLogger } from '@/lib/logger'
import NotificationRuleForm, { NotificationRule } from './notification-rule-form'
import { 
  Plus, 
  AlertTriangle, 
  MessageSquare, 
  Users, 
  Sparkles, 
  MoreVertical,
  Pencil,
  Trash2,
  Play,
  Pause,
  Bell
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const logger = createClientLogger('NotificationRulesContent')

function formatTimeAgo(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  
  if (diffMins < 1) return 'только что'
  if (diffMins < 60) return `${diffMins} мин назад`
  if (diffHours < 24) return `${diffHours} ч назад`
  if (diffDays < 7) return `${diffDays} дн назад`
  return date.toLocaleDateString('ru')
}

interface NotificationRuleData {
  id: string
  name: string
  description: string | null
  rule_type: 'negative_discussion' | 'unanswered_question' | 'group_inactive' | 'churning_participant' | 'inactive_newcomer' | 'critical_event'
  config: Record<string, unknown>
  use_ai: boolean
  notify_owner: boolean
  notify_admins: boolean
  is_enabled: boolean
  is_system?: boolean
  send_telegram?: boolean
  last_check_at: string | null
  last_triggered_at: string | null
  trigger_count: number
  created_at: string
}

interface TelegramGroup {
  id: number
  tg_chat_id: string
  title: string | null
  bot_status: string | null
}

const RULE_TYPE_INFO: Record<string, { label: string; icon: any; color: string; bg: string; description?: string }> = {
  negative_discussion: {
    label: 'Негатив в чате',
    icon: AlertTriangle,
    color: 'text-red-600',
    bg: 'bg-red-50',
    description: 'AI обнаруживает конфликты и негатив в сообщениях',
  },
  unanswered_question: {
    label: 'Неотвеченный вопрос',
    icon: MessageSquare,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    description: 'AI находит вопросы, оставшиеся без ответа',
  },
  group_inactive: {
    label: 'Неактивность группы',
    icon: Users,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    description: 'Группа не активна дольше заданного времени',
  },
  churning_participant: {
    label: 'Участник на грани оттока',
    icon: Users,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    description: 'Участник перестал писать более 14 дней',
  },
  inactive_newcomer: {
    label: 'Новичок без активности',
    icon: Users,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    description: 'Новый участник не проявляет активности',
  },
  critical_event: {
    label: 'Низкие регистрации на событие',
    icon: AlertTriangle,
    color: 'text-red-600',
    bg: 'bg-red-50',
    description: 'Мало регистраций на ближайшее событие (менее 30%)',
  },
}

export default function NotificationRulesContent() {
  const params = useParams()
  const router = useRouter()
  const orgId = params.org as string

  const [rules, setRules] = useState<NotificationRuleData[]>([])
  const [groups, setGroups] = useState<TelegramGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingRule, setEditingRule] = useState<NotificationRuleData | null>(null)

  useEffect(() => {
    loadData()
  }, [orgId])

  const loadData = async () => {
    setLoading(true)
    try {
      // Load rules and groups in parallel
      const [rulesRes, groupsRes] = await Promise.all([
        fetch(`/api/notifications/rules?orgId=${orgId}`),
        fetch(`/api/telegram/groups/for-org?orgId=${orgId}`),
      ])

      if (rulesRes.ok) {
        const { rules } = await rulesRes.json()
        setRules(rules || [])
      }

      if (groupsRes.ok) {
        const { groups } = await groupsRes.json()
        setGroups(groups || [])
      }
    } catch (error) {
      logger.error({ error }, 'Error loading notification rules')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveRule = async (ruleData: NotificationRule) => {
    const isEditing = !!ruleData.id
    const url = isEditing 
      ? `/api/notifications/rules/${ruleData.id}`
      : '/api/notifications/rules'
    
    const response = await fetch(url, {
      method: isEditing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...ruleData, orgId }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to save rule')
    }

    await loadData()
    setShowForm(false)
    setEditingRule(null)
  }

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm('Удалить это правило уведомлений?')) return

    try {
      const response = await fetch(`/api/notifications/rules/${ruleId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setRules(prev => prev.filter(r => r.id !== ruleId))
      }
    } catch (error) {
      logger.error({ error }, 'Error deleting rule')
      alert('Ошибка удаления правила')
    }
  }

  const handleToggleRule = async (rule: NotificationRuleData) => {
    try {
      const response = await fetch(`/api/notifications/rules/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: !rule.is_enabled }),
      })

      if (response.ok) {
        setRules(prev => prev.map(r => 
          r.id === rule.id ? { ...r, is_enabled: !r.is_enabled } : r
        ))
      }
    } catch (error) {
      logger.error({ error }, 'Error toggling rule')
    }
  }

  const handleUpdateSystemRule = async (ruleId: string, updates: Partial<NotificationRuleData>) => {
    try {
      const response = await fetch(`/api/notifications/rules/${ruleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })

      if (response.ok) {
        setRules(prev => prev.map(r => 
          r.id === ruleId ? { ...r, ...updates } : r
        ))
      }
    } catch (error) {
      logger.error({ error }, 'Error updating system rule')
    }
  }

  const handleEditRule = (rule: NotificationRuleData) => {
    setEditingRule(rule)
    setShowForm(true)
  }

  const handleCancelForm = () => {
    setShowForm(false)
    setEditingRule(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  if (showForm) {
    return (
      <div className="max-w-2xl">
        <h3 className="text-lg font-semibold mb-4">
          {editingRule ? 'Редактировать правило' : 'Новое правило уведомлений'}
        </h3>
        <NotificationRuleForm
          orgId={orgId}
          rule={editingRule ? {
            id: editingRule.id,
            name: editingRule.name,
            description: editingRule.description || undefined,
            rule_type: editingRule.rule_type,
            config: editingRule.config,
            use_ai: editingRule.use_ai,
            notify_owner: editingRule.notify_owner,
            notify_admins: editingRule.notify_admins,
            is_enabled: editingRule.is_enabled,
          } : undefined}
          groups={groups}
          onSave={handleSaveRule}
          onCancel={handleCancelForm}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-600">
            Настройте автоматические уведомления о важных событиях в ваших группах
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Новое правило
        </Button>
      </div>

      {/* Info block */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start gap-3">
          <Bell className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-900">Как это работает?</h4>
            <p className="text-sm text-blue-700 mt-1">
              Правила проверяются автоматически. При срабатывании вы получите 
              уведомление в Telegram через бота @orbo_assist_bot.
            </p>
          </div>
        </div>
      </div>

      {/* System Rules Section */}
      {rules.filter(r => r.is_system).length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Системные уведомления
          </h3>
          {rules.filter(r => r.is_system).map(rule => {
            const typeInfo = RULE_TYPE_INFO[rule.rule_type] || { 
              label: rule.rule_type, 
              icon: Bell, 
              color: 'text-gray-600', 
              bg: 'bg-gray-50' 
            }
            const Icon = typeInfo.icon

            return (
              <div 
                key={rule.id}
                className={`border rounded-lg p-4 ${rule.is_enabled ? 'bg-white' : 'bg-gray-50 opacity-75'}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div className={`p-2 rounded-lg ${typeInfo.bg}`}>
                      <Icon className={`h-5 w-5 ${typeInfo.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium">{rule.name}</h4>
                        {!rule.is_enabled && (
                          <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                            Отключено
                          </span>
                        )}
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                          Системное
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5">{typeInfo.description || typeInfo.label}</p>
                      
                      {/* Delivery settings for system rules */}
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={rule.notify_owner}
                            onChange={() => handleUpdateSystemRule(rule.id, { notify_owner: !rule.notify_owner })}
                            className="rounded border-gray-300 h-3.5 w-3.5"
                          />
                          <span className="text-gray-600">Владельцу</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={rule.notify_admins}
                            onChange={() => handleUpdateSystemRule(rule.id, { notify_admins: !rule.notify_admins })}
                            className="rounded border-gray-300 h-3.5 w-3.5"
                          />
                          <span className="text-gray-600">Админам</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={rule.send_telegram ?? false}
                            onChange={() => handleUpdateSystemRule(rule.id, { send_telegram: !(rule.send_telegram ?? false) })}
                            className="rounded border-gray-300 h-3.5 w-3.5"
                          />
                          <span className="text-gray-600">В Telegram</span>
                        </label>
                        {rule.last_triggered_at && (
                          <span className="text-gray-400 ml-1">
                            Сработало: {formatTimeAgo(rule.last_triggered_at)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleRule(rule)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex-shrink-0 ${
                      rule.is_enabled 
                        ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {rule.is_enabled ? 'Включено' : 'Включить'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Digest Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
          <Bell className="h-4 w-4" />
          Еженедельный дайджест
        </h3>
        <DigestInlineSettings orgId={orgId} />
      </div>

      {/* Custom Rules Section */}
      <div className="space-y-4">
        {rules.filter(r => !r.is_system).length > 0 && (
          <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Пользовательские правила
            <span className="text-xs text-gray-400 font-normal">(с AI-анализом и Telegram)</span>
          </h3>
        )}
        
        {rules.filter(r => !r.is_system).length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-lg">
            <Sparkles className="h-10 w-10 text-gray-400 mx-auto mb-3" />
            <h3 className="text-base font-medium text-gray-900">Нет пользовательских правил</h3>
            <p className="text-gray-500 mt-1 text-sm">
              Создайте правило с AI-анализом для получения уведомлений в Telegram
            </p>
            <Button onClick={() => setShowForm(true)} className="mt-4" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Создать правило
            </Button>
          </div>
        ) : (
          <>
            {rules.filter(r => !r.is_system).map(rule => {
              const typeInfo = RULE_TYPE_INFO[rule.rule_type] || { 
                label: rule.rule_type, 
                icon: Bell, 
                color: 'text-gray-600', 
                bg: 'bg-gray-50' 
              }
              const Icon = typeInfo.icon
              const groupCount = rule.config.groups 
                ? (rule.config.groups as string[]).length 
                : groups.length

              return (
                <div 
                  key={rule.id}
                  className={`border rounded-lg p-4 ${rule.is_enabled ? 'bg-white' : 'bg-gray-50 opacity-75'}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${typeInfo.bg}`}>
                        <Icon className={`h-5 w-5 ${typeInfo.color}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{rule.name}</h4>
                          {!rule.is_enabled && (
                            <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                              Приостановлено
                            </span>
                          )}
                          {rule.use_ai && (
                            <span className="inline-flex items-center gap-1 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                              <Sparkles className="h-3 w-3" />
                              AI
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5">{typeInfo.label}</p>
                        {rule.description && (
                          <p className="text-sm text-gray-600 mt-1">{rule.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
                          <span>
                            {groupCount === groups.length ? 'Все группы' : `${groupCount} групп`}
                          </span>
                          {typeof rule.config.check_interval_minutes === 'number' && (
                            <span>
                              Интервал: {rule.config.check_interval_minutes} мин
                            </span>
                          )}
                          {rule.last_check_at && (
                            <span title={new Date(rule.last_check_at).toLocaleString('ru')}>
                              Проверено: {formatTimeAgo(rule.last_check_at)}
                            </span>
                          )}
                          {rule.last_triggered_at && (
                            <span>
                              Сработало: {new Date(rule.last_triggered_at).toLocaleDateString('ru')}
                            </span>
                          )}
                          {rule.trigger_count > 0 && (
                            <span>
                              Всего: {rule.trigger_count} раз
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <button 
                          type="button"
                          className="h-8 w-8 p-0 inline-flex items-center justify-center rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                          <MoreVertical className="h-4 w-4" />
                          <span className="sr-only">Открыть меню</span>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 bg-white border shadow-md z-50">
                        <DropdownMenuItem 
                          onSelect={() => handleEditRule(rule)}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Редактировать
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onSelect={() => handleToggleRule(rule)}
                        >
                          {rule.is_enabled ? (
                            <>
                              <Pause className="h-4 w-4 mr-2" />
                              Приостановить
                            </>
                          ) : (
                            <>
                              <Play className="h-4 w-4 mr-2" />
                              Включить
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="text-red-600 focus:text-red-600 focus:bg-red-50"
                          onSelect={() => handleDeleteRule(rule.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Удалить
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

// Inline digest settings component
function DigestInlineSettings({ orgId }: { orgId: string }) {
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [day, setDay] = useState(1)
  const [time, setTime] = useState('09:00:00')
  const [lastSent, setLastSent] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const DAYS = [
    { value: 0, label: 'Вс' },
    { value: 1, label: 'Пн' },
    { value: 2, label: 'Вт' },
    { value: 3, label: 'Ср' },
    { value: 4, label: 'Чт' },
    { value: 5, label: 'Пт' },
    { value: 6, label: 'Сб' },
  ]

  useEffect(() => {
    loadDigestSettings()
  }, [orgId])

  const loadDigestSettings = async () => {
    try {
      const res = await fetch(`/api/organizations/${orgId}/digest-settings`)
      if (res.ok) {
        const data = await res.json()
        setEnabled(data.digest_enabled || false)
        setDay(data.digest_day ?? 1)
        setTime(data.digest_time || '09:00:00')
        setLastSent(data.last_digest_sent_at)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (updates: Record<string, unknown>) => {
    setSaving(true)
    try {
      await fetch(`/api/organizations/${orgId}/digest-settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  const toggleEnabled = async () => {
    const newEnabled = !enabled
    setEnabled(newEnabled)
    await handleSave({ digest_enabled: newEnabled })
  }

  if (loading) {
    return <div className="border rounded-lg p-4 bg-gray-50 text-center text-sm text-gray-400">Загрузка...</div>
  }

  return (
    <div className={`border rounded-lg p-4 ${enabled ? 'bg-white' : 'bg-gray-50 opacity-75'}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1">
          <div className="p-2 rounded-lg bg-indigo-50">
            <Bell className="h-5 w-5 text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-medium">Еженедельный дайджест</h4>
              {!enabled && (
                <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">Отключено</span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              AI-отчёт с метриками активности, топ-участниками и рекомендациями
            </p>
            
            {enabled && (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-500">День:</span>
                  <select 
                    value={day}
                    onChange={async (e) => { 
                      const v = parseInt(e.target.value); 
                      setDay(v); 
                      await handleSave({ digest_day: v }) 
                    }}
                    className="border rounded px-1.5 py-0.5 text-xs"
                  >
                    {DAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-500">Время:</span>
                  <input 
                    type="time"
                    value={time.slice(0, 5)}
                    onChange={async (e) => { 
                      const v = e.target.value + ':00'; 
                      setTime(v); 
                      await handleSave({ digest_time: v }) 
                    }}
                    className="border rounded px-1.5 py-0.5 text-xs"
                  />
                </div>
                {lastSent && (
                  <span className="text-gray-400">
                    Отправлен: {formatTimeAgo(lastSent)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={toggleEnabled}
          disabled={saving}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex-shrink-0 ${
            enabled 
              ? 'bg-green-100 text-green-700 hover:bg-green-200' 
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {enabled ? 'Включено' : 'Включить'}
        </button>
      </div>
    </div>
  )
}

