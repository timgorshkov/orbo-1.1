'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { createClientLogger } from '@/lib/logger'
import { AlertTriangle, Sparkles, Clock, MessageSquare, Users } from 'lucide-react'

const logger = createClientLogger('NotificationRuleForm')

export interface NotificationRule {
  id?: string
  name: string
  description?: string
  rule_type: 'negative_discussion' | 'unanswered_question' | 'group_inactive' | 'churning_participant' | 'inactive_newcomer' | 'critical_event'
  config: Record<string, unknown>
  use_ai: boolean
  notify_owner: boolean
  notify_admins: boolean
  is_enabled: boolean
}

interface TelegramGroup {
  id: number
  tg_chat_id: string
  title: string | null
  bot_status: string | null
}

interface NotificationRuleFormProps {
  orgId: string
  rule?: NotificationRule
  groups: TelegramGroup[]
  onSave: (rule: NotificationRule) => Promise<void>
  onCancel: () => void
}

const RULE_TYPES = [
  {
    id: 'negative_discussion',
    label: 'Негатив в чате',
    description: 'Уведомление при обнаружении ругани, конфликтов или негативной тональности',
    icon: AlertTriangle,
    requiresAI: true,
  },
  {
    id: 'unanswered_question',
    label: 'Неотвеченный вопрос',
    description: 'Уведомление если вопрос остался без ответа в течение указанного времени',
    icon: MessageSquare,
    requiresAI: true,
  },
  {
    id: 'group_inactive',
    label: 'Неактивность группы',
    description: 'Уведомление если в группе нет сообщений в течение указанного времени',
    icon: Users,
    requiresAI: false,
  },
] as const

const WEEKDAYS = [
  { id: 1, label: 'Пн' },
  { id: 2, label: 'Вт' },
  { id: 3, label: 'Ср' },
  { id: 4, label: 'Чт' },
  { id: 5, label: 'Пт' },
  { id: 6, label: 'Сб' },
  { id: 0, label: 'Вс' },
]

const DEFAULT_CONFIG: Record<string, Record<string, unknown>> = {
  negative_discussion: {
    groups: null,
    severity_threshold: 'medium',
    check_interval_minutes: 60,
  },
  unanswered_question: {
    groups: null,
    timeout_hours: 2,
    work_hours_start: '09:00',
    work_hours_end: '18:00',
    work_days: [1, 2, 3, 4, 5],
    timezone: 'Europe/Moscow',
  },
  group_inactive: {
    groups: null,
    timeout_hours: 24,
    work_hours_start: null,
    work_hours_end: null,
    work_days: null,
    timezone: 'Europe/Moscow',
  },
}

export default function NotificationRuleForm({
  orgId,
  rule,
  groups,
  onSave,
  onCancel,
}: NotificationRuleFormProps) {
  const isEditing = !!rule?.id
  
  const [name, setName] = useState(rule?.name || '')
  const [description, setDescription] = useState(rule?.description || '')
  const [ruleType, setRuleType] = useState<NotificationRule['rule_type']>(
    rule?.rule_type || 'negative_discussion'
  )
  const [config, setConfig] = useState<Record<string, unknown>>(
    rule?.config || DEFAULT_CONFIG.negative_discussion
  )
  const [useAI, setUseAI] = useState(rule?.use_ai ?? true)
  const [notifyOwner, setNotifyOwner] = useState(rule?.notify_owner ?? true)
  const [notifyAdmins, setNotifyAdmins] = useState(rule?.notify_admins ?? false)
  const [isEnabled, setIsEnabled] = useState(rule?.is_enabled ?? true)
  const [saving, setSaving] = useState(false)
  const [selectedGroups, setSelectedGroups] = useState<string[]>(
    (rule?.config?.groups as string[]) || []
  )
  const [allGroups, setAllGroups] = useState(!(rule?.config?.groups))

  // Update config when rule type changes
  useEffect(() => {
    if (!isEditing) {
      setConfig(DEFAULT_CONFIG[ruleType])
      setSelectedGroups([])
      setAllGroups(true)
      
      // Auto-enable AI for types that require it
      const typeInfo = RULE_TYPES.find(t => t.id === ruleType)
      if (typeInfo?.requiresAI) {
        setUseAI(true)
      }
    }
  }, [ruleType, isEditing])

  const updateConfig = (key: string, value: unknown) => {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  const handleGroupToggle = (chatId: string) => {
    setSelectedGroups(prev => 
      prev.includes(chatId) 
        ? prev.filter(id => id !== chatId)
        : [...prev, chatId]
    )
  }

  const handleWorkDayToggle = (dayId: number) => {
    const currentDays = (config.work_days as number[]) || []
    const newDays = currentDays.includes(dayId)
      ? currentDays.filter(d => d !== dayId)
      : [...currentDays, dayId]
    updateConfig('work_days', newDays)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      alert('Введите название правила')
      return
    }

    setSaving(true)
    try {
      const finalConfig = {
        ...config,
        groups: allGroups ? null : selectedGroups,
      }

      await onSave({
        id: rule?.id,
        name: name.trim(),
        description: description.trim() || undefined,
        rule_type: ruleType,
        config: finalConfig,
        use_ai: useAI,
        notify_owner: notifyOwner,
        notify_admins: notifyAdmins,
        is_enabled: isEnabled,
      })
    } catch (error) {
      logger.error({ error }, 'Error saving notification rule')
      alert('Ошибка сохранения правила')
    } finally {
      setSaving(false)
    }
  }

  const selectedTypeInfo = RULE_TYPES.find(t => t.id === ruleType)

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info */}
      <div className="space-y-4">
        <div>
          <Label htmlFor="name">Название правила *</Label>
          <Input
            id="name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Например: Мониторинг негатива в рабочих чатах"
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="description">Описание</Label>
          <Textarea
            id="description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Опишите, для чего нужно это правило"
            className="mt-1"
            rows={2}
          />
        </div>
      </div>

      {/* Rule Type Selection */}
      <div className="space-y-3">
        <Label>Тип правила</Label>
        <div className="grid gap-3">
          {RULE_TYPES.map(type => {
            const Icon = type.icon
            const isSelected = ruleType === type.id
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => setRuleType(type.id as NotificationRule['rule_type'])}
                className={`flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-colors ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Icon className={`h-5 w-5 mt-0.5 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                      {type.label}
                    </span>
                    {type.requiresAI && (
                      <span className="inline-flex items-center gap-1 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                        <Sparkles className="h-3 w-3" />
                        AI
                      </span>
                    )}
                  </div>
                  <p className={`text-sm mt-0.5 ${isSelected ? 'text-blue-700' : 'text-gray-500'}`}>
                    {type.description}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Group Selection */}
      <div className="space-y-3">
        <Label>Группы для мониторинга</Label>
        
        <div className="flex items-center gap-2">
          <Switch
            checked={allGroups}
            onCheckedChange={setAllGroups}
          />
          <span className="text-sm text-gray-600">
            {allGroups ? 'Все группы организации' : 'Выбранные группы'}
          </span>
        </div>

        {!allGroups && (
          <div className="mt-3 space-y-2 max-h-48 overflow-y-auto border rounded-lg p-3">
            {groups.length === 0 ? (
              <p className="text-sm text-gray-500">Нет подключённых групп</p>
            ) : (
              groups.map(group => (
                <label
                  key={group.tg_chat_id}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Checkbox
                    checked={selectedGroups.includes(group.tg_chat_id)}
                    onCheckedChange={() => handleGroupToggle(group.tg_chat_id)}
                  />
                  <span className="text-sm">{group.title || `Группа ${group.tg_chat_id}`}</span>
                  {group.bot_status !== 'connected' && (
                    <span className="text-xs text-orange-600">(бот не подключён)</span>
                  )}
                </label>
              ))
            )}
          </div>
        )}
      </div>

      {/* Type-specific Settings */}
      <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
        <h4 className="font-medium text-gray-900">Настройки правила</h4>

        {/* Negative Discussion Settings */}
        {ruleType === 'negative_discussion' && (
          <div className="space-y-4">
            <div className="text-xs text-gray-500 bg-blue-50 rounded p-2">
              <strong>Как работает:</strong> AI анализирует сообщения в группе и обнаруживает негатив.
              Уведомления отправляются в бот и отображаются в разделе «Уведомления» и на Дашборде.
              Дедупликация: одно уведомление на группу раз в 6 часов по одному инциденту.
              Автосокрытие: уведомление остаётся активным, пока вы не отметите его как решённое.
            </div>
            <div>
              <Label>Порог серьёзности</Label>
              <Select
                value={(config.severity_threshold as string) || 'medium'}
                onValueChange={value => updateConfig('severity_threshold', value)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Низкий (любой негатив)</SelectItem>
                  <SelectItem value="medium">Средний (заметный конфликт)</SelectItem>
                  <SelectItem value="high">Высокий (только серьёзные конфликты)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Интервал проверки (минуты)</Label>
              <Input
                type="number"
                min={15}
                max={1440}
                value={(config.check_interval_minutes as number) || 60}
                onChange={e => updateConfig('check_interval_minutes', parseInt(e.target.value) || 60)}
                className="mt-1 w-32"
              />
              <p className="text-xs text-gray-500 mt-1">Минимум 15 минут</p>
            </div>
          </div>
        )}

        {/* Unanswered Question Settings */}
        {ruleType === 'unanswered_question' && (
          <div className="space-y-4">
            <div className="text-xs text-gray-500 bg-blue-50 rounded p-2">
              <strong>Как работает:</strong> AI определяет вопросы без ответа в группе.
              Уведомления отправляются в бот и отображаются в «Уведомлениях» и на Дашборде.
              Дедупликация: одно уведомление на вопрос раз в 6 часов. Проверка только в рабочее время.
              Автосокрытие: уведомление остаётся до ручной отметки «Решено».
            </div>
            <div>
              <Label>Таймаут без ответа (часы)</Label>
              <Input
                type="number"
                min={1}
                max={72}
                value={(config.timeout_hours as number) || 2}
                onChange={e => updateConfig('timeout_hours', parseInt(e.target.value) || 2)}
                className="mt-1 w-32"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Начало рабочего времени</Label>
                <Input
                  type="time"
                  value={(config.work_hours_start as string) || '09:00'}
                  onChange={e => updateConfig('work_hours_start', e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Конец рабочего времени</Label>
                <Input
                  type="time"
                  value={(config.work_hours_end as string) || '18:00'}
                  onChange={e => updateConfig('work_hours_end', e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label>Рабочие дни</Label>
              <div className="flex gap-2 mt-2">
                {WEEKDAYS.map(day => {
                  const workDays = (config.work_days as number[]) || [1, 2, 3, 4, 5]
                  const isActive = workDays.includes(day.id)
                  return (
                    <button
                      key={day.id}
                      type="button"
                      onClick={() => handleWorkDayToggle(day.id)}
                      className={`w-10 h-10 rounded-full text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {day.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Group Inactive Settings */}
        {ruleType === 'group_inactive' && (
          <div className="space-y-4">
            <div className="text-xs text-gray-500 bg-blue-50 rounded p-2">
              <strong>Как работает:</strong> Уведомление при отсутствии сообщений дольше указанного таймаута.
              Одно уведомление на период молчания (дедупликация 48 ч).
              Автосокрытие: уведомление снимается автоматически, когда активность в группе возобновляется.
            </div>
            <div>
              <Label>Таймаут неактивности (часы)</Label>
              <Input
                type="number"
                min={1}
                max={168}
                value={(config.timeout_hours as number) || 24}
                onChange={e => updateConfig('timeout_hours', parseInt(e.target.value) || 24)}
                className="mt-1 w-32"
              />
              <p className="text-xs text-gray-500 mt-1">Уведомить, если нет сообщений указанное время</p>
            </div>
          </div>
        )}
      </div>

      {/* AI Info (for types that require AI) */}
      {selectedTypeInfo?.requiresAI && (
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-purple-600 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-medium text-purple-900">AI-анализ включён</h4>
              <p className="text-sm text-purple-700 mt-1">
                Для определения негатива и вопросов используется AI-анализ сообщений.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Notification Recipients */}
      <div className="space-y-3">
        <Label>Кому отправлять уведомления</Label>
        
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={notifyOwner}
              onCheckedChange={(checked) => setNotifyOwner(!!checked)}
            />
            <span className="text-sm">Владельцу организации</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={notifyAdmins}
              onCheckedChange={(checked) => setNotifyAdmins(!!checked)}
            />
            <span className="text-sm">Всем администраторам</span>
          </label>
        </div>

        <p className="text-xs text-gray-500">
          Уведомления будут отправлены через бота @orbo_assist_bot в Telegram
        </p>
      </div>

      {/* Enable/Disable */}
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
        <div>
          <Label>Правило активно</Label>
          <p className="text-sm text-gray-500">Отключите, чтобы приостановить проверки</p>
        </div>
        <Switch
          checked={isEnabled}
          onCheckedChange={setIsEnabled}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t">
        <Button type="submit" disabled={saving}>
          {saving ? 'Сохранение...' : isEditing ? 'Сохранить изменения' : 'Создать правило'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </form>
  )
}

