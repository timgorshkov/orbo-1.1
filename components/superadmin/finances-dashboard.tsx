'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Wallet, ArrowDownToLine, ArrowUpFromLine, Building2, FileText,
  ChevronLeft, ChevronRight, CheckCircle2, XCircle, Clock, Loader2,
  Search, ArrowLeft, Download, AlertTriangle, Eye
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────

interface PlatformOverview {
  total_income: number
  total_commission: number
  total_withdrawn: number
  total_refunded: number
  payment_count: number
  pending_withdrawals_count: number
  pending_withdrawals_total: number
  orgs_with_balance: number
}

interface Withdrawal {
  id: string
  org_id: string
  org_name: string
  status: string
  amount: number
  net_amount: number
  commission_amount: number
  currency: string
  act_number: string | null
  act_document_url: string | null
  rejection_reason: string | null
  requested_at: string
  processed_at: string | null
  completed_at: string | null
}

interface OrgDetail {
  org: {
    id: string
    name: string
    slug: string
    commission_rate: number | null
    min_withdrawal_amount: number | null
    is_active: boolean | null
    contract_status: string | null
    contract_number: string | null
  } | null
  balance: number
  events: Array<{
    id: string
    title: string
    event_date: string
    payment_count: number
    total_collected: number
    total_commission: number
  }>
  summary: {
    total_income: number
    total_commission: number
    total_refunded: number
    payment_count: number
  }
}

interface Transaction {
  id: string
  type: string
  amount: number
  currency: string
  balance_after: number
  description: string | null
  event_id: string | null
  event_title: string | null
  participant_id: string | null
  participant_name: string | null
  participant_username: string | null
  payment_gateway: string | null
  created_at: string
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  requested: { label: 'Запрошен', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  processing: { label: 'В обработке', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  completed: { label: 'Выполнен', color: 'bg-green-100 text-green-800 border-green-200' },
  rejected: { label: 'Отклонён', color: 'bg-red-100 text-red-800 border-red-200' },
}

const TX_LABELS: Record<string, string> = {
  payment_incoming: 'Оплата',
  commission_deduction: 'Комиссия',
  withdrawal_requested: 'Вывод (заморожено)',
  withdrawal_completed: 'Вывод выполнен',
  withdrawal_rejected: 'Вывод отклонён',
  refund: 'Возврат',
  commission_reversal: 'Возврат комиссии',
  adjustment: 'Корректировка',
}

const GATEWAY_LABELS: Record<string, string> = {
  yookassa: 'ЮKassa',
  tbank: 'T-Bank',
  sbp: 'СБП',
  manual: 'Ручной',
}

// ─── Component ──────────────────────────────────────────────────────

export default function FinancesDashboard() {
  const [activeTab, setActiveTab] = useState<'overview' | 'withdrawals' | 'org'>('overview')
  const [overview, setOverview] = useState<PlatformOverview | null>(null)
  const [loading, setLoading] = useState(true)

  // Withdrawals state
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [wdTotal, setWdTotal] = useState(0)
  const [wdPage, setWdPage] = useState(1)
  const [wdStatusFilter, setWdStatusFilter] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  // Org detail state
  const [orgDetail, setOrgDetail] = useState<OrgDetail | null>(null)
  const [orgTransactions, setOrgTransactions] = useState<Transaction[]>([])
  const [orgTxTotal, setOrgTxTotal] = useState(0)
  const [orgTxPage, setOrgTxPage] = useState(1)
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [orgSearch, setOrgSearch] = useState('')
  const [orgSearchResults, setOrgSearchResults] = useState<Array<{ id: string; name: string }>>([])

  // Load overview
  useEffect(() => {
    fetch('/api/superadmin/finances?view=overview')
      .then(r => r.json())
      .then(data => setOverview(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Load withdrawals
  const loadWithdrawals = useCallback(async () => {
    const params = new URLSearchParams({ view: 'withdrawals', page: wdPage.toString(), pageSize: '30' })
    if (wdStatusFilter) params.set('status', wdStatusFilter)
    const res = await fetch(`/api/superadmin/finances?${params}`)
    const data = await res.json()
    setWithdrawals(data.withdrawals || [])
    setWdTotal(data.total || 0)
  }, [wdPage, wdStatusFilter])

  useEffect(() => {
    if (activeTab === 'withdrawals') loadWithdrawals()
  }, [activeTab, loadWithdrawals])

  // Load org detail
  const loadOrgDetail = useCallback(async (orgId: string) => {
    setSelectedOrgId(orgId)
    setSelectedEventId(null)
    setOrgTxPage(1)
    const res = await fetch(`/api/superadmin/finances?view=org-detail&orgId=${orgId}`)
    const data = await res.json()
    setOrgDetail(data)
    setActiveTab('org')
  }, [])

  // Load org transactions
  const loadOrgTransactions = useCallback(async () => {
    if (!selectedOrgId) return
    const params = new URLSearchParams({
      view: 'org-transactions', orgId: selectedOrgId,
      page: orgTxPage.toString(), pageSize: '30'
    })
    if (selectedEventId) params.set('eventId', selectedEventId)
    const res = await fetch(`/api/superadmin/finances?${params}`)
    const data = await res.json()
    setOrgTransactions(data.transactions || [])
    setOrgTxTotal(data.total || 0)
  }, [selectedOrgId, selectedEventId, orgTxPage])

  useEffect(() => {
    if (activeTab === 'org' && selectedOrgId) loadOrgTransactions()
  }, [activeTab, loadOrgTransactions])

  // Search orgs — use superadmin finances API
  const searchOrgs = async (query: string) => {
    setOrgSearch(query)
    if (query.length < 2) { setOrgSearchResults([]); return }
    const res = await fetch(`/api/superadmin/finances?view=org-search&query=${encodeURIComponent(query)}`)
    const data = await res.json()
    setOrgSearchResults(data.organizations || [])
  }

  // Withdrawal actions
  const handleWithdrawalAction = async (action: string, withdrawalId: string, reason?: string) => {
    setActionLoading(withdrawalId)
    try {
      const res = await fetch('/api/superadmin/finances', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, withdrawalId, reason }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Ошибка')
        return
      }
      loadWithdrawals()
      // Refresh overview
      fetch('/api/superadmin/finances?view=overview')
        .then(r => r.json())
        .then(data => setOverview(data))
    } catch {
      alert('Ошибка сети')
    } finally {
      setActionLoading(null)
      setRejectingId(null)
      setRejectReason('')
    }
  }

  const formatAmount = (n: number) => n.toLocaleString('ru-RU', { minimumFractionDigits: 2 })
  const formatDate = (s: string) => new Date(s).toLocaleDateString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
  const formatShortDate = (s: string) => new Date(s).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })

  if (loading) return <div className="py-8 text-center text-gray-500">Загрузка...</div>

  return (
    <div className="space-y-6">
      {/* Tab nav */}
      <div className="flex gap-1 border-b border-gray-200">
        {[
          { id: 'overview' as const, label: 'Обзор платформы' },
          { id: 'withdrawals' as const, label: `Выводы${overview && overview.pending_withdrawals_count > 0 ? ` (${overview.pending_withdrawals_count})` : ''}` },
          { id: 'org' as const, label: selectedOrgId ? `Орг: ${orgDetail?.org?.name || '...'}` : 'По организации' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-purple-600 text-purple-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── OVERVIEW TAB ──────────────────────────────────────── */}
      {activeTab === 'overview' && overview && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <ArrowDownToLine className="w-4 h-4 text-green-600" />
                  <p className="text-xs text-gray-500">Всего оплат</p>
                </div>
                <p className="text-xl font-bold text-green-700">{formatAmount(overview.total_income)} ₽</p>
                <p className="text-xs text-gray-400 mt-0.5">{overview.payment_count} платежей</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Wallet className="w-4 h-4 text-purple-600" />
                  <p className="text-xs text-gray-500">Комиссия Orbo</p>
                </div>
                <p className="text-xl font-bold text-purple-700">{formatAmount(overview.total_commission)} ₽</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <ArrowUpFromLine className="w-4 h-4 text-orange-600" />
                  <p className="text-xs text-gray-500">Выведено орг-ям</p>
                </div>
                <p className="text-xl font-bold text-gray-700">{formatAmount(overview.total_withdrawn)} ₽</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Building2 className="w-4 h-4 text-blue-600" />
                  <p className="text-xs text-gray-500">Орг-ий с балансом</p>
                </div>
                <p className="text-xl font-bold text-blue-700">{overview.orgs_with_balance}</p>
              </CardContent>
            </Card>
          </div>

          {overview.pending_withdrawals_count > 0 && (
            <Card className="border-amber-200 bg-amber-50/50">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">
                        {overview.pending_withdrawals_count} ожидающих выводов
                      </p>
                      <p className="text-xs text-amber-600">
                        На сумму {formatAmount(overview.pending_withdrawals_total)} ₽
                      </p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setActiveTab('withdrawals')}>
                    Перейти
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {overview.total_refunded > 0 && (
            <p className="text-sm text-gray-500">
              Возвратов: {formatAmount(overview.total_refunded)} ₽
            </p>
          )}
        </div>
      )}

      {/* ─── WITHDRAWALS TAB ───────────────────────────────────── */}
      {activeTab === 'withdrawals' && (
        <div className="space-y-4">
          <div className="flex gap-3 items-end">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Статус</label>
              <select
                value={wdStatusFilter}
                onChange={(e) => { setWdStatusFilter(e.target.value); setWdPage(1) }}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">Все</option>
                <option value="requested">Запрошенные</option>
                <option value="processing">В обработке</option>
                <option value="completed">Выполненные</option>
                <option value="rejected">Отклонённые</option>
              </select>
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Дата</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Организация</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Статус</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Сумма</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Акт</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {withdrawals.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">Нет выводов</td></tr>
                ) : (
                  withdrawals.map(wd => {
                    const si = STATUS_LABELS[wd.status] || { label: wd.status, color: '' }
                    return (
                      <tr key={wd.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap text-xs">{formatDate(wd.requested_at)}</td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => loadOrgDetail(wd.org_id)}
                            className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {wd.org_name}
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${si.color}`}>
                            {si.label}
                          </span>
                          {wd.rejection_reason && (
                            <p className="text-xs text-red-500 mt-0.5">{wd.rejection_reason}</p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap font-medium">{formatAmount(wd.net_amount)} ₽</td>
                        <td className="px-3 py-2">
                          {wd.act_document_url ? (
                            <a href={wd.act_document_url} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
                              <Download className="w-3 h-3" />{wd.act_number || 'Скачать'}
                            </a>
                          ) : <span className="text-xs text-gray-400">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {wd.status === 'requested' && (
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="outline"
                                disabled={actionLoading === wd.id}
                                onClick={() => handleWithdrawalAction('process-withdrawal', wd.id)}>
                                {actionLoading === wd.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'В работу'}
                              </Button>
                              <Button size="sm" variant="outline"
                                className="text-red-600 border-red-200 hover:bg-red-50"
                                onClick={() => setRejectingId(wd.id)}>
                                Отклонить
                              </Button>
                            </div>
                          )}
                          {wd.status === 'processing' && (
                            <Button size="sm"
                              disabled={actionLoading === wd.id}
                              onClick={() => handleWithdrawalAction('complete-withdrawal', wd.id)}>
                              {actionLoading === wd.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Выполнен'}
                            </Button>
                          )}
                          {rejectingId === wd.id && (
                            <div className="mt-2 flex gap-1">
                              <Input
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="Причина"
                                className="text-xs h-7"
                              />
                              <Button size="sm" variant="outline"
                                className="text-red-600 shrink-0 h-7"
                                disabled={!rejectReason}
                                onClick={() => handleWithdrawalAction('reject-withdrawal', wd.id, rejectReason)}>
                                OK
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {Math.ceil(wdTotal / 30) > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">Стр. {wdPage} из {Math.ceil(wdTotal / 30)} ({wdTotal})</p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={wdPage <= 1} onClick={() => setWdPage(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={wdPage >= Math.ceil(wdTotal / 30)} onClick={() => setWdPage(p => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── ORG DETAIL TAB ────────────────────────────────────── */}
      {activeTab === 'org' && (
        <div className="space-y-6">
          {/* Org search */}
          {!selectedOrgId && (
            <div className="max-w-md">
              <label className="text-sm font-medium block mb-2">Поиск организации</label>
              <Input
                value={orgSearch}
                onChange={(e) => searchOrgs(e.target.value)}
                placeholder="Название организации..."
                className="mb-2"
              />
              {orgSearchResults.length > 0 && (
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {orgSearchResults.map(org => (
                    <button
                      key={org.id}
                      onClick={() => loadOrgDetail(org.id)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
                    >
                      <span>{org.name}</span>
                      <Eye className="w-4 h-4 text-gray-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Org detail view */}
          {selectedOrgId && orgDetail && (
            <>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={() => { setSelectedOrgId(null); setOrgDetail(null); setSelectedEventId(null) }}>
                  <ArrowLeft className="w-4 h-4 mr-1" /> Назад
                </Button>
                <div>
                  <h3 className="text-lg font-semibold">{orgDetail.org?.name}</h3>
                  <p className="text-xs text-gray-500">
                    Договор: {orgDetail.org?.contract_number || 'нет'} ({orgDetail.org?.contract_status || '—'})
                    {' • '}Комиссия: {((orgDetail.org?.commission_rate || 0.05) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-3 pb-2">
                    <p className="text-xs text-gray-500">Баланс</p>
                    <p className="text-lg font-bold">{formatAmount(orgDetail.balance)} ₽</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-3 pb-2">
                    <p className="text-xs text-gray-500">Поступления</p>
                    <p className="text-lg font-bold text-green-700">{formatAmount(orgDetail.summary?.total_income || 0)} ₽</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-3 pb-2">
                    <p className="text-xs text-gray-500">Комиссия</p>
                    <p className="text-lg font-bold text-purple-700">{formatAmount(orgDetail.summary?.total_commission || 0)} ₽</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-3 pb-2">
                    <p className="text-xs text-gray-500">Платежей</p>
                    <p className="text-lg font-bold">{orgDetail.summary?.payment_count || 0}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Events breakdown */}
              {orgDetail.events.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Сборы по событиям</h4>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Событие</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Дата</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Оплат</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Собрано</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Комиссия</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {orgDetail.events.map(ev => (
                          <tr key={ev.id} className={`hover:bg-gray-50 ${selectedEventId === ev.id ? 'bg-blue-50' : ''}`}>
                            <td className="px-3 py-2 text-gray-900 max-w-[200px] truncate">{ev.title}</td>
                            <td className="px-3 py-2 text-gray-500 whitespace-nowrap text-xs">{formatShortDate(ev.event_date)}</td>
                            <td className="px-3 py-2 text-right">{ev.payment_count}</td>
                            <td className="px-3 py-2 text-right font-medium text-green-700">{formatAmount(ev.total_collected)} ₽</td>
                            <td className="px-3 py-2 text-right text-gray-500">{formatAmount(ev.total_commission)} ₽</td>
                            <td className="px-3 py-2 text-right">
                              <button
                                onClick={() => { setSelectedEventId(selectedEventId === ev.id ? null : ev.id); setOrgTxPage(1) }}
                                className="text-xs text-blue-600 hover:text-blue-800"
                              >
                                {selectedEventId === ev.id ? 'Скрыть' : 'Транзакции'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Transactions table */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  {selectedEventId ? 'Транзакции по событию' : 'Все транзакции'}
                  {selectedEventId && (
                    <button onClick={() => setSelectedEventId(null)} className="text-xs text-blue-600 ml-2">(показать все)</button>
                  )}
                </h4>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Дата</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Тип</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Участник</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Событие</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Способ</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Сумма</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Баланс</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {orgTransactions.length === 0 ? (
                        <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">Нет транзакций</td></tr>
                      ) : (
                        orgTransactions.map(tx => (
                          <tr key={tx.id} className="hover:bg-gray-50">
                            <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap text-xs">{formatDate(tx.created_at)}</td>
                            <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap text-xs">{TX_LABELS[tx.type] || tx.type}</td>
                            <td className="px-3 py-1.5 text-gray-600 text-xs max-w-[120px] truncate">
                              {tx.participant_name || tx.participant_username || '—'}
                            </td>
                            <td className="px-3 py-1.5 text-gray-600 text-xs max-w-[150px] truncate">
                              {tx.event_title || '—'}
                            </td>
                            <td className="px-3 py-1.5 text-gray-500 text-xs">
                              {tx.payment_gateway ? (GATEWAY_LABELS[tx.payment_gateway] || tx.payment_gateway) : '—'}
                            </td>
                            <td className={`px-3 py-1.5 text-right whitespace-nowrap font-medium text-xs ${
                              tx.amount > 0 ? 'text-green-700' : tx.amount < 0 ? 'text-red-600' : 'text-gray-500'
                            }`}>
                              {tx.amount > 0 ? '+' : ''}{formatAmount(tx.amount)} ₽
                            </td>
                            <td className="px-3 py-1.5 text-right whitespace-nowrap text-gray-500 text-xs">
                              {formatAmount(tx.balance_after)} ₽
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {Math.ceil(orgTxTotal / 30) > 1 && (
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-gray-500">Стр. {orgTxPage} из {Math.ceil(orgTxTotal / 30)} ({orgTxTotal})</p>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" disabled={orgTxPage <= 1} onClick={() => setOrgTxPage(p => p - 1)}>
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm" disabled={orgTxPage >= Math.ceil(orgTxTotal / 30)} onClick={() => setOrgTxPage(p => p + 1)}>
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
