'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Crown, Plus, Trash2, ExternalLink, CreditCard, Save, Settings2 } from 'lucide-react'

const PRODAMUS_REF_URL = 'https://connect.prodamus.ru/?ref=ORBOPARTNERS&c=Rw6'

const PERIOD_OPTIONS = [
  { value: 'monthly', label: 'Ежемесячно' },
  { value: 'quarterly', label: 'Ежеквартально' },
  { value: 'semi_annual', label: 'Раз в полгода' },
  { value: 'annual', label: 'Ежегодно' },
  { value: 'one_time', label: 'Разовый платёж' },
  { value: 'weekly', label: 'Еженедельно' },
  { value: 'custom', label: 'Свой период' },
]

interface AccessRule {
  resource_type: string
  resource_id: string | null
}

interface Plan {
  id?: string
  name: string
  description: string
  price: number | null
  currency: string
  billing_period: string
  custom_period_days: number | null
  payment_link: string
  payment_instructions: string
  trial_days: number
  grace_period_days: number
  is_active: boolean
  is_public: boolean
  max_members: number | null
  access_rules: AccessRule[]
}

interface OrgGroup {
  tg_chat_id: string
  title: string
  platform: string
}

interface OrgChannel {
  id: string
  title: string
  tg_chat_id: string
}

interface MembershipPlanEditorProps {
  orgId: string
  plan?: Plan & { id: string }
  groups: OrgGroup[]
  channels: OrgChannel[]
  maxGroups: Array<{ max_chat_id: string; title: string }>
  onSave: () => void
  onCancel: () => void
}

export function MembershipPlanEditor({
  orgId, plan, groups, channels, maxGroups, onSave, onCancel,
}: MembershipPlanEditorProps) {
  const isEdit = !!plan?.id

  const [form, setForm] = useState<Plan>({
    name: plan?.name || '',
    description: plan?.description || '',
    price: plan?.price ?? null,
    currency: plan?.currency || 'RUB',
    billing_period: plan?.billing_period || 'monthly',
    custom_period_days: plan?.custom_period_days || null,
    payment_link: plan?.payment_link || '',
    payment_instructions: plan?.payment_instructions || '',
    trial_days: plan?.trial_days || 0,
    grace_period_days: plan?.grace_period_days ?? 3,
    is_active: plan?.is_active ?? true,
    is_public: plan?.is_public ?? true,
    max_members: plan?.max_members ?? null,
    access_rules: plan?.access_rules || [],
  })

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const updateField = (key: keyof Plan, value: any) => setForm(prev => ({ ...prev, [key]: value }))

  const toggleAccessRule = (type: string, id: string | null) => {
    setForm(prev => {
      const exists = prev.access_rules.some(r => r.resource_type === type && r.resource_id === id)
      if (exists) {
        return { ...prev, access_rules: prev.access_rules.filter(r => !(r.resource_type === type && r.resource_id === id)) }
      }
      return { ...prev, access_rules: [...prev.access_rules, { resource_type: type, resource_id: id }] }
    })
  }

  const hasRule = (type: string, id: string | null) =>
    form.access_rules.some(r => r.resource_type === type && r.resource_id === id)

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Укажите название плана'); return }
    setSaving(true)
    setError(null)
    try {
      const method = isEdit ? 'PATCH' : 'POST'
      const body: any = {
        orgId,
        ...form,
        accessRules: form.access_rules,
      }
      if (isEdit) body.id = plan!.id

      const res = await fetch('/api/membership-plans', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка')
      onSave()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Crown className="h-5 w-5 text-emerald-600" />
            {isEdit ? 'Редактировать план' : 'Новый план членства'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Название</label>
            <Input value={form.name} onChange={e => updateField('name', e.target.value)} placeholder="Клубное членство" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
            <textarea
              value={form.description}
              onChange={e => updateField('description', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[60px]"
              placeholder="Полный доступ к закрытым группам и материалам"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Стоимость</label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={form.price ?? ''}
                  onChange={e => updateField('price', e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="0 = бесплатно"
                  className="flex-1"
                />
                <select
                  value={form.currency}
                  onChange={e => updateField('currency', e.target.value)}
                  className="w-20 rounded-lg border border-gray-300 px-2 py-2 text-sm"
                >
                  <option value="RUB">RUB</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Период оплаты</label>
              <select
                value={form.billing_period}
                onChange={e => updateField('billing_period', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {form.billing_period === 'custom' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Кол-во дней (свой период)</label>
              <Input
                type="number"
                value={form.custom_period_days ?? ''}
                onChange={e => updateField('custom_period_days', e.target.value ? parseInt(e.target.value) : null)}
                placeholder="30"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Пробный период (дней)</label>
              <Input type="number" value={form.trial_days} onChange={e => updateField('trial_days', parseInt(e.target.value) || 0)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Льготный период (дней)</label>
              <Input type="number" value={form.grace_period_days} onChange={e => updateField('grace_period_days', parseInt(e.target.value) || 0)} />
              <p className="text-xs text-gray-500 mt-0.5">Время после истечения до отключения доступа</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_active} onChange={e => updateField('is_active', e.target.checked)} className="rounded" />
              Активен
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_public} onChange={e => updateField('is_public', e.target.checked)} className="rounded" />
              Публичный
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Access rules */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-gray-600" />
            Доступ по плану
          </CardTitle>
          <p className="text-sm text-gray-500 mt-1">Отметьте ресурсы, доступ к которым получают участники этого плана</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {groups.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Telegram-группы</h4>
              <div className="space-y-1">
                {groups.filter(g => g.platform === 'telegram').map(g => (
                  <label key={g.tg_chat_id} className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={hasRule('telegram_group', g.tg_chat_id)}
                      onChange={() => toggleAccessRule('telegram_group', g.tg_chat_id)}
                      className="rounded"
                    />
                    {g.title}
                  </label>
                ))}
              </div>
            </div>
          )}

          {channels.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Telegram-каналы</h4>
              <div className="space-y-1">
                {channels.map(c => (
                  <label key={c.id} className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={hasRule('telegram_channel', c.tg_chat_id)}
                      onChange={() => toggleAccessRule('telegram_channel', c.tg_chat_id)}
                      className="rounded"
                    />
                    {c.title}
                  </label>
                ))}
              </div>
            </div>
          )}

          {maxGroups.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">MAX-группы</h4>
              <div className="space-y-1">
                {maxGroups.map(g => (
                  <label key={g.max_chat_id} className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={hasRule('max_group', g.max_chat_id)}
                      onChange={() => toggleAccessRule('max_group', g.max_chat_id)}
                      className="rounded"
                    />
                    {g.title}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Контент организации</h4>
            <div className="space-y-1">
              <label className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-gray-50">
                <input type="checkbox" checked={hasRule('materials', null)} onChange={() => toggleAccessRule('materials', null)} className="rounded" />
                Материалы
              </label>
              <label className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-gray-50">
                <input type="checkbox" checked={hasRule('events', null)} onChange={() => toggleAccessRule('events', null)} className="rounded" />
                Непубличные события
              </label>
              <label className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-gray-50">
                <input type="checkbox" checked={hasRule('member_directory', null)} onChange={() => toggleAccessRule('member_directory', null)} className="rounded" />
                Каталог участников
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment link */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-gray-600" />
            Оплата
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Платёжная ссылка</label>
            <Input
              type="url"
              value={form.payment_link}
              onChange={e => updateField('payment_link', e.target.value)}
              placeholder="https://..."
            />
            <p className="text-xs text-gray-500 mt-0.5">Ссылка для оплаты участниками (Prodamus, ЮKassa и т.д.)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Инструкции по оплате</label>
            <textarea
              value={form.payment_instructions}
              onChange={e => updateField('payment_instructions', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[60px]"
              placeholder="Реквизиты для банковского перевода, контакты для уточнения..."
            />
          </div>

          <div className="rounded-lg border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-4">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="w-4 h-4 text-indigo-600" />
              <span className="text-sm font-medium text-indigo-900">Подключите Prodamus для приёма оплаты картами</span>
            </div>
            <p className="text-xs text-gray-600 mb-3">Подходит для ООО, ИП и самозанятых. Комиссия 2,9–3,8%.</p>
            <a
              href={PRODAMUS_REF_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition"
            >
              Заполнить анкету <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onCancel}>Отмена</Button>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Создать план'}
        </Button>
      </div>
    </div>
  )
}
