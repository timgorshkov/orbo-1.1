'use client'

import { useState, useEffect } from 'react'
import { Crown, Users, Calendar, Check, X, RefreshCw, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'

interface Subscription {
  id: string
  org_id: string
  org_name: string
  org_status: string
  plan_code: string
  status: string
  started_at: string
  expires_at: string | null
  over_limit_since: string | null
  notes: string | null
}

interface Invoice {
  id: string
  org_id: string
  amount: number
  currency: string
  period_start: string
  period_end: string
  status: string
  payment_method: string | null
  paid_at: string | null
  confirmed_by: string | null
  created_at: string
  act_number?: string | null
  act_document_url?: string | null
  customer_name?: string | null
  customer_type?: string | null
}

interface BillingPlan {
  code: string
  name: string
  price_monthly: number | null
}

export default function BillingManagement() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [plans, setPlans] = useState<BillingPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pro' | 'free' | 'overdue'>('all')
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null)
  const [activatingOrg, setActivatingOrg] = useState<string | null>(null)
  const [paymentAmount, setPaymentAmount] = useState(1500)
  const [selectedPlanCode, setSelectedPlanCode] = useState('pro')
  const [actionLoading, setActionLoading] = useState(false)
  // Customer data for act / receipt generation
  const [customerType, setCustomerType] = useState<'individual' | 'legal_entity' | 'self_employed'>('individual')
  const [customerName, setCustomerName] = useState('')
  const [customerInn, setCustomerInn] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'bank_transfer' | 'manual'>('bank_transfer')

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/superadmin/billing')
      if (!res.ok) return
      const data = await res.json()
      setSubscriptions(data.subscriptions || [])
      setInvoices(data.invoices || [])
      setPlans(data.plans || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const filtered = subscriptions.filter(s => {
    if (filter === 'pro') return s.plan_code !== 'free' && s.plan_code !== 'promo'
    if (filter === 'free') return s.plan_code === 'free'
    if (filter === 'overdue') return s.over_limit_since !== null
    return true
  })

  const paidCount = subscriptions.filter(s => s.plan_code !== 'free' && s.plan_code !== 'promo').length
  const freeCount = subscriptions.filter(s => s.plan_code === 'free').length
  const overdueCount = subscriptions.filter(s => s.over_limit_since !== null).length
  const monthlyRevenue = subscriptions
    .filter(s => s.status === 'active')
    .reduce((sum, s) => {
      const plan = plans.find(p => p.code === s.plan_code)
      return sum + (plan?.price_monthly || 0)
    }, 0)

  const handleAddPayment = async (orgId: string) => {
    if (paymentAmount <= 0) return
    if (!customerName.trim() || customerName.trim().length < 4) {
      alert('Укажите ФИО или название организации')
      return
    }
    if (customerType !== 'legal_entity' && !customerEmail.trim()) {
      alert('Для физлиц и самозанятых обязателен email (для фискального чека)')
      return
    }

    setActionLoading(true)
    try {
      const res = await fetch(`/api/superadmin/billing/${orgId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_payment',
          amount: paymentAmount,
          planCode: selectedPlanCode,
          paymentMethod,
          customer: {
            type: customerType,
            name: customerName.trim(),
            inn: customerInn.trim() || undefined,
            email: customerEmail.trim() || undefined,
            phone: customerPhone.trim() || undefined,
          },
        }),
      })
      if (res.ok) {
        const result = await res.json()
        if (result.periodEnd) {
          const actMsg = result.actUrl ? '\nАкт сформирован.' : ''
          alert(`Оплата добавлена. Подписка до ${new Date(result.periodEnd).toLocaleDateString('ru-RU')}.${actMsg}`)
        }
        setActivatingOrg(null)
        setPaymentAmount(1500)
        setSelectedPlanCode('pro')
        setCustomerName('')
        setCustomerInn('')
        setCustomerEmail('')
        setCustomerPhone('')
        setCustomerType('individual')
        setPaymentMethod('bank_transfer')
        await fetchData()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Не удалось добавить оплату')
      }
    } catch {
      alert('Ошибка сети')
    }
    setActionLoading(false)
  }

  const handleCancel = async (orgId: string) => {
    if (!confirm('Отменить подписку и вернуть на бесплатный тариф?')) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/superadmin/billing/${orgId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      })
      if (res.ok) await fetchData()
    } catch {}
    setActionLoading(false)
  }

  const handleActivatePromo = async (orgId: string) => {
    if (!confirm('Установить тариф Промо (Клубный бесплатно)?')) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/superadmin/billing/${orgId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'activate_promo' }),
      })
      if (res.ok) {
        alert('Тариф Промо активирован')
        await fetchData()
      }
    } catch {}
    setActionLoading(false)
  }

  const orgInvoices = (orgId: string) => invoices.filter(i => i.org_id === orgId)

  if (loading) {
    return <div className="animate-pulse space-y-4"><div className="h-32 bg-gray-200 rounded-xl" /><div className="h-64 bg-gray-200 rounded-xl" /></div>
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <div className="text-sm text-gray-500">Всего организаций</div>
          <div className="text-2xl font-bold">{subscriptions.length}</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-sm text-gray-500">Платные подписки</div>
          <div className="text-2xl font-bold text-purple-600">{paidCount}</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-sm text-gray-500">Превышен лимит</div>
          <div className="text-2xl font-bold text-red-600">{overdueCount}</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-sm text-gray-500">MRR</div>
          <div className="text-2xl font-bold text-green-600">{monthlyRevenue.toLocaleString('ru-RU')} ₽</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        {(['all', 'pro', 'free', 'overdue'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition ${
              filter === f ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f === 'all' ? `Все (${subscriptions.length})` : f === 'pro' ? `Платные (${paidCount})` : f === 'free' ? `Free (${freeCount})` : `Превышен (${overdueCount})`}
          </button>
        ))}
        <button onClick={fetchData} className="ml-auto p-2 text-gray-400 hover:text-gray-600">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Subscriptions table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Организация</th>
              <th className="px-4 py-3 font-medium">Тариф</th>
              <th className="px-4 py-3 font-medium">Статус</th>
              <th className="px-4 py-3 font-medium">Действует до</th>
              <th className="px-4 py-3 font-medium">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(sub => {
              const isExpanded = expandedOrg === sub.org_id
              const subInvoices = orgInvoices(sub.org_id)
              return (
                <tr key={sub.id} className="group">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setExpandedOrg(isExpanded ? null : sub.org_id)}
                      className="flex items-center gap-2 text-left hover:text-purple-600"
                    >
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      <span className="font-medium">{sub.org_name}</span>
                    </button>
                    {isExpanded && subInvoices.length > 0 && (
                      <div className="mt-3 ml-6 space-y-1">
                        <div className="text-xs font-medium text-gray-400 mb-1">Платежи:</div>
                        {subInvoices.map(inv => (
                          <div key={inv.id} className="flex items-center gap-3 text-xs text-gray-500">
                            <span>{new Date(inv.created_at).toLocaleDateString('ru-RU')}</span>
                            <span className="font-medium">{inv.amount.toLocaleString('ru-RU')} {inv.currency}</span>
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${inv.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {inv.status === 'paid' ? 'Оплачен' : 'Ожидает'}
                            </span>
                            <span className="text-gray-400">{inv.payment_method || '-'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {isExpanded && subInvoices.length === 0 && (
                      <div className="mt-2 ml-6 text-xs text-gray-400">Нет платежей</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      sub.plan_code === 'pro' ? 'bg-purple-100 text-purple-700' : sub.plan_code === 'enterprise' ? 'bg-indigo-100 text-indigo-700' : sub.plan_code === 'promo' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {(sub.plan_code === 'pro' || sub.plan_code === 'enterprise' || sub.plan_code === 'promo') && <Crown className="h-3 w-3" />}
                      {sub.plan_code === 'pro' ? 'Pro' : sub.plan_code === 'enterprise' ? 'Клубный' : sub.plan_code === 'promo' ? 'Промо' : 'Free'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {sub.over_limit_since ? (
                      <span className="text-red-600 text-xs font-medium">Превышен лимит</span>
                    ) : (
                      <span className="text-green-600 text-xs font-medium">Активен</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {sub.expires_at ? new Date(sub.expires_at).toLocaleDateString('ru-RU') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setActivatingOrg(sub.org_id)
                          setSelectedPlanCode(sub.plan_code === 'free' || sub.plan_code === 'promo' ? 'pro' : sub.plan_code)
                          setPaymentAmount(1500)
                        }}
                        className="px-2.5 py-1 bg-purple-50 text-purple-700 text-xs rounded-lg font-medium hover:bg-purple-100"
                      >
                        {sub.plan_code === 'free' ? 'Активировать' : 'Добавить оплату'}
                      </button>
                      {sub.plan_code !== 'promo' && (
                        <button
                          onClick={() => handleActivatePromo(sub.org_id)}
                          disabled={actionLoading}
                          className="px-2.5 py-1 bg-green-50 text-green-700 text-xs rounded-lg font-medium hover:bg-green-100 disabled:opacity-50"
                        >
                          Промо
                        </button>
                      )}
                      {(sub.plan_code === 'pro' || sub.plan_code === 'enterprise' || sub.plan_code === 'promo') && (
                        <button
                          onClick={() => handleCancel(sub.org_id)}
                          disabled={actionLoading}
                          className="px-2.5 py-1 bg-red-50 text-red-600 text-xs rounded-lg font-medium hover:bg-red-100 disabled:opacity-50"
                        >
                          Отменить
                        </button>
                      )}
                      <a
                        href={`/p/${sub.org_id}/settings?tab=billing`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 text-gray-400 hover:text-gray-600"
                        title="Открыть настройки"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">Нет подписок</div>
        )}
      </div>

      {/* Payment modal */}
      {activatingOrg && (() => {
        const sub = subscriptions.find(s => s.org_id === activatingOrg)
        const paidPlans = plans.filter(p => p.price_monthly && p.price_monthly > 0)
        const chosenPlan = paidPlans.find(p => p.code === selectedPlanCode)
        const planPrice = chosenPlan?.price_monthly || 1500
        const daysEstimate = Math.round((paymentAmount / planPrice) * 30)
        const willGenerateReceipt = customerType !== 'legal_entity'
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <h3 className="text-base font-semibold mb-1">Добавить оплату</h3>
              <p className="text-sm text-gray-500 mb-4">{sub?.org_name}</p>
              <div className="space-y-4">
                {/* Plan + amount */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Тарифный план</label>
                    <select
                      value={selectedPlanCode}
                      onChange={e => {
                        setSelectedPlanCode(e.target.value)
                        const p = paidPlans.find(pl => pl.code === e.target.value)
                        if (p?.price_monthly) setPaymentAmount(p.price_monthly)
                      }}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      {paidPlans.map(p => (
                        <option key={p.code} value={p.code}>
                          {p.name} ({p.price_monthly?.toLocaleString('ru-RU')} ₽/мес)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Сумма, ₽</label>
                    <input
                      type="number"
                      value={paymentAmount}
                      onChange={e => setPaymentAmount(Number(e.target.value))}
                      min={100}
                      step={100}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    {paymentAmount > 0 && (
                      <p className="text-xs text-gray-400 mt-1">
                        ≈ {daysEstimate} {daysEstimate === 1 ? 'день' : daysEstimate < 5 ? 'дня' : 'дней'}
                      </p>
                    )}
                  </div>
                </div>

                {/* Payment method */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Способ оплаты</label>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value as 'bank_transfer' | 'manual')}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="bank_transfer">Банковский перевод</option>
                    <option value="manual">Другое (прочее)</option>
                  </select>
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Плательщик (для акта и чека)</h4>

                  {/* Customer type */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Тип плательщика</label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { value: 'individual', label: 'Физлицо' },
                        { value: 'self_employed', label: 'Самозанятый' },
                        { value: 'legal_entity', label: 'Юрлицо / ИП' },
                      ] as const).map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setCustomerType(opt.value)}
                          className={`p-2 text-xs rounded-lg border transition ${
                            customerType === opt.value
                              ? 'border-purple-500 bg-purple-50 text-purple-700'
                              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Name */}
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {customerType === 'legal_entity' ? 'Название организации *' : 'ФИО *'}
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={e => setCustomerName(e.target.value)}
                      placeholder={customerType === 'legal_entity' ? 'ООО "Ромашка"' : 'Иванов Иван Иванович'}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  {/* Email / INN grid */}
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Email {customerType !== 'legal_entity' && <span className="text-red-500">*</span>}
                      </label>
                      <input
                        type="email"
                        value={customerEmail}
                        onChange={e => setCustomerEmail(e.target.value)}
                        placeholder="email@example.com"
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        ИНН {customerType === 'legal_entity' && <span className="text-gray-400">(реком.)</span>}
                      </label>
                      <input
                        type="text"
                        value={customerInn}
                        onChange={e => setCustomerInn(e.target.value.replace(/\D/g, ''))}
                        placeholder={customerType === 'legal_entity' ? '7701234567' : '123456789012'}
                        maxLength={12}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>

                  {/* Phone */}
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Телефон</label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={e => setCustomerPhone(e.target.value)}
                      placeholder="+7..."
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  {/* Receipt info */}
                  <div className={`mt-3 p-2.5 rounded-lg text-xs ${willGenerateReceipt ? 'bg-green-50 text-green-800' : 'bg-gray-50 text-gray-600'}`}>
                    {willGenerateReceipt ? (
                      <>✓ Будет выбит фискальный чек на указанный email. Сформируется акт передачи прав.</>
                    ) : (
                      <>Безналичный расчёт между юрлицами — чек не требуется. Сформируется только акт.</>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => handleAddPayment(activatingOrg)}
                  disabled={actionLoading || paymentAmount <= 0}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  {actionLoading ? 'Сохранение...' : 'Подтвердить оплату'}
                </button>
                <button
                  onClick={() => setActivatingOrg(null)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Recent invoices */}
      {invoices.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Последние платежи</h3>
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Дата</th>
                  <th className="px-4 py-3 font-medium">Организация</th>
                  <th className="px-4 py-3 font-medium">Плательщик</th>
                  <th className="px-4 py-3 font-medium">Сумма</th>
                  <th className="px-4 py-3 font-medium">Период</th>
                  <th className="px-4 py-3 font-medium">Способ</th>
                  <th className="px-4 py-3 font-medium">Акт</th>
                  <th className="px-4 py-3 font-medium">Статус</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.slice(0, 20).map(inv => {
                  const sub = subscriptions.find(s => s.org_id === inv.org_id)
                  return (
                    <tr key={inv.id}>
                      <td className="px-4 py-3">{new Date(inv.created_at).toLocaleDateString('ru-RU')}</td>
                      <td className="px-4 py-3 font-medium">{sub?.org_name || inv.org_id.slice(0, 8)}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {inv.customer_name || '—'}
                      </td>
                      <td className="px-4 py-3 font-medium">{inv.amount.toLocaleString('ru-RU')} {inv.currency}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(inv.period_start).toLocaleDateString('ru-RU')} — {new Date(inv.period_end).toLocaleDateString('ru-RU')}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{inv.payment_method || '-'}</td>
                      <td className="px-4 py-3">
                        {inv.act_document_url ? (
                          <a
                            href={inv.act_document_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-purple-600 hover:text-purple-800 text-xs"
                          >
                            {inv.act_number || 'Акт'}
                          </a>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${inv.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {inv.status === 'paid' ? 'Оплачен' : 'Ожидает'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
