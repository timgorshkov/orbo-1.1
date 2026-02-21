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
  const [activateMonths, setActivateMonths] = useState(1)
  const [actionLoading, setActionLoading] = useState(false)

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
    if (filter === 'pro') return s.plan_code === 'pro'
    if (filter === 'free') return s.plan_code === 'free'
    if (filter === 'overdue') return s.over_limit_since !== null
    return true
  })

  const proCount = subscriptions.filter(s => s.plan_code === 'pro').length
  const freeCount = subscriptions.filter(s => s.plan_code === 'free').length
  const overdueCount = subscriptions.filter(s => s.over_limit_since !== null).length
  const monthlyRevenue = subscriptions
    .filter(s => s.plan_code === 'pro' && s.status === 'active')
    .length * 1500

  const handleActivate = async (orgId: string) => {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/superadmin/billing/${orgId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'activate_pro', months: activateMonths }),
      })
      if (res.ok) {
        setActivatingOrg(null)
        setActivateMonths(1)
        await fetchData()
      }
    } catch {}
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
          <div className="text-sm text-gray-500">Pro-подписки</div>
          <div className="text-2xl font-bold text-purple-600">{proCount}</div>
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
            {f === 'all' ? `Все (${subscriptions.length})` : f === 'pro' ? `Pro (${proCount})` : f === 'free' ? `Free (${freeCount})` : `Превышен (${overdueCount})`}
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
                      sub.plan_code === 'pro' ? 'bg-purple-100 text-purple-700' : sub.plan_code === 'enterprise' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {sub.plan_code === 'pro' && <Crown className="h-3 w-3" />}
                      {sub.plan_code === 'pro' ? 'Pro' : sub.plan_code === 'enterprise' ? 'Enterprise' : 'Free'}
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
                      {activatingOrg === sub.org_id ? (
                        <div className="flex items-center gap-2">
                          <select
                            value={activateMonths}
                            onChange={e => setActivateMonths(Number(e.target.value))}
                            className="text-xs border rounded px-2 py-1"
                          >
                            {[1, 3, 6, 12].map(m => (
                              <option key={m} value={m}>{m} мес ({(1500 * m).toLocaleString('ru-RU')} ₽)</option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleActivate(sub.org_id)}
                            disabled={actionLoading}
                            className="px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 disabled:opacity-50"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => setActivatingOrg(null)}
                            className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded hover:bg-gray-200"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <>
                          {sub.plan_code !== 'pro' && (
                            <button
                              onClick={() => setActivatingOrg(sub.org_id)}
                              className="px-2.5 py-1 bg-purple-50 text-purple-700 text-xs rounded-lg font-medium hover:bg-purple-100"
                            >
                              Активировать Pro
                            </button>
                          )}
                          {sub.plan_code === 'pro' && (
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
                        </>
                      )}
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
                  <th className="px-4 py-3 font-medium">Сумма</th>
                  <th className="px-4 py-3 font-medium">Период</th>
                  <th className="px-4 py-3 font-medium">Способ</th>
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
                      <td className="px-4 py-3 font-medium">{inv.amount.toLocaleString('ru-RU')} {inv.currency}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(inv.period_start).toLocaleDateString('ru-RU')} — {new Date(inv.period_end).toLocaleDateString('ru-RU')}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{inv.payment_method || '-'}</td>
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
