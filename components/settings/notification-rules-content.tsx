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
  rule_type: 'negative_discussion' | 'unanswered_question' | 'group_inactive'
  config: Record<string, unknown>
  use_ai: boolean
  notify_owner: boolean
  notify_admins: boolean
  is_enabled: boolean
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

const RULE_TYPE_INFO = {
  negative_discussion: {
    label: 'Негатив в чате',
    icon: AlertTriangle,
    color: 'text-red-600',
    bg: 'bg-red-50',
  },
  unanswered_question: {
    label: 'Неотвеченный вопрос',
    icon: MessageSquare,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
  },
  group_inactive: {
    label: 'Неактивность группы',
    icon: Users,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
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
            <p className="text-sm text-blue-600 mt-2">
              <Sparkles className="h-4 w-4 inline mr-1" />
              Правила с AI-анализом более точно определяют негатив и вопросы, 
              но потребляют токены OpenAI.
            </p>
          </div>
        </div>
      </div>

      {/* Rules List */}
      {rules.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Bell className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Нет правил уведомлений</h3>
          <p className="text-gray-500 mt-1">
            Создайте первое правило, чтобы получать уведомления о важных событиях
          </p>
          <Button onClick={() => setShowForm(true)} className="mt-4">
            <Plus className="h-4 w-4 mr-2" />
            Создать правило
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {rules.map(rule => {
            const typeInfo = RULE_TYPE_INFO[rule.rule_type]
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

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => handleEditRule(rule)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Редактировать
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => handleToggleRule(rule)}>
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
                        onSelect={() => handleDeleteRule(rule.id)}
                        className="text-red-600"
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
        </div>
      )}
    </div>
  )
}

