'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Wallet, ArrowDownToLine, ArrowUpFromLine, FileText, AlertCircle,
  ChevronLeft, ChevronRight, Download, Clock, CheckCircle2, XCircle, Loader2, Filter
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────

interface FinancialSummary {
  balance: number
  totalIncome: number
  totalCommission: number
  totalWithdrawn: number
  totalRefunded: number
  transactionCount: number
}

interface Transaction {
  id: string
  type: string
  amount: number
  currency: string
  balance_after: number
  description: string | null
  event_id: string | null
  participant_id: string | null
  payment_gateway: string | null
  created_at: string
}

interface Withdrawal {
  id: string
  status: string
  amount: number
  net_amount: number
  commission_amount: number
  currency: string
  act_number: string | null
  act_document_url: string | null
  rejection_reason: string | null
  requested_at: string
  completed_at: string | null
  org_name?: string
}

interface ContractInfo {
  id: string
  status: string
}

const TRANSACTION_LABELS: Record<string, string> = {
  payment_incoming: 'Оплата',
  commission_deduction: 'Комиссия',
  withdrawal_requested: 'Вывод (заморожено)',
  withdrawal_completed: 'Вывод выполнен',
  withdrawal_rejected: 'Вывод отклонён',
  refund: 'Возврат',
  commission_reversal: 'Возврат комиссии',
  adjustment: 'Корректировка',
}

const WITHDRAWAL_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  requested: { label: 'Запрошен', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  processing: { label: 'В обработке', color: 'text-blue-700 bg-blue-50 border-blue-200' },
  completed: { label: 'Выполнен', color: 'text-green-700 bg-green-50 border-green-200' },
  rejected: { label: 'Отклонён', color: 'text-red-700 bg-red-50 border-red-200' },
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  RUB: '₽', USD: '$', EUR: '€', KZT: '₸', BYN: 'Br'
}

// ─── Component ──────────────────────────────────────────────────────

export default function FinancesContent() {
  const params = useParams()
  const orgId = params.org as string

  const [summary, setSummary] = useState<FinancialSummary | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [transactionsTotal, setTransactionsTotal] = useState(0)
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [withdrawalsTotal, setWithdrawalsTotal] = useState(0)
  const [contract, setContract] = useState<ContractInfo | null>(null)

  const [loading, setLoading] = useState(true)
  const [activeView, setActiveView] = useState<'transactions' | 'withdrawals'>('transactions')
  const [txPage, setTxPage] = useState(1)
  const [wdPage, setWdPage] = useState(1)
  const [txTypeFilter, setTxTypeFilter] = useState<string>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [requestingWithdrawal, setRequestingWithdrawal] = useState(false)
  const [withdrawalError, setWithdrawalError] = useState<string | null>(null)

  const hasActiveContract = contract && (contract.status === 'verified' || contract.status === 'signed')

  // Load initial data
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [summaryRes, contractRes] = await Promise.all([
          fetch(`/api/org-account/summary?orgId=${orgId}`),
          fetch(`/api/contracts?orgId=${orgId}`),
        ])
        const summaryData = await summaryRes.json()
        const contractData = await contractRes.json()

        if (summaryRes.ok) setSummary(summaryData)
        if (contractData.contract) setContract(contractData.contract)
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [orgId])

  // Load transactions
  const loadTransactions = useCallback(async () => {
    const params = new URLSearchParams({ orgId, page: txPage.toString(), pageSize: '20' })
    if (txTypeFilter) params.set('type', txTypeFilter)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)

    const res = await fetch(`/api/org-account/transactions?${params}`)
    const data = await res.json()
    if (res.ok) {
      setTransactions(data.transactions || [])
      setTransactionsTotal(data.total || 0)
    }
  }, [orgId, txPage, txTypeFilter, dateFrom, dateTo])

  // Load withdrawals
  const loadWithdrawals = useCallback(async () => {
    const params = new URLSearchParams({ orgId, page: wdPage.toString(), pageSize: '20' })
    const res = await fetch(`/api/org-withdrawals?${params}`)
    const data = await res.json()
    if (res.ok) {
      setWithdrawals(data.withdrawals || [])
      setWithdrawalsTotal(data.total || 0)
    }
  }, [orgId, wdPage])

  useEffect(() => {
    if (activeView === 'transactions') loadTransactions()
  }, [activeView, loadTransactions])

  useEffect(() => {
    if (activeView === 'withdrawals') loadWithdrawals()
  }, [activeView, loadWithdrawals])

  const formatAmount = (amount: number, currency: string = 'RUB') => {
    const sym = CURRENCY_SYMBOLS[currency] || currency
    const formatted = Math.abs(amount).toLocaleString('ru-RU', { minimumFractionDigits: 2 })
    const sign = amount < 0 ? '-' : amount > 0 ? '+' : ''
    return `${sign}${formatted} ${sym}`
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  // Request withdrawal
  const handleRequestWithdrawal = async () => {
    if (!summary || summary.balance <= 0) return

    setRequestingWithdrawal(true)
    setWithdrawalError(null)

    try {
      const res = await fetch('/api/org-withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          amount: summary.balance,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Не удалось запросить вывод')
      }

      // Refresh data
      const summaryRes = await fetch(`/api/org-account/summary?orgId=${orgId}`)
      const summaryData = await summaryRes.json()
      if (summaryRes.ok) setSummary(summaryData)

      setActiveView('withdrawals')
      loadWithdrawals()
    } catch (e: any) {
      setWithdrawalError(e.message)
    } finally {
      setRequestingWithdrawal(false)
    }
  }

  // ─── Not configured state ────────────────────────────────────────
  if (!loading && !hasActiveContract) {
    return (
      <div className="max-w-2xl space-y-4">
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2 text-blue-700">
              <AlertCircle className="w-5 h-5" />
              <p className="text-sm font-medium">Приём платежей не подключён</p>
            </div>
            <p className="text-sm text-gray-600">
              Для работы с финансами необходимо заключить договор и подключить приём платежей.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.href = `/p/${orgId}/settings?tab=contract`}
              >
                <FileText className="w-4 h-4 mr-1.5" />
                Заключить договор
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.href = `/p/${orgId}/settings?tab=payments`}
              >
                Настройки платежей
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (loading) {
    return <div className="py-8 text-center text-gray-500">Загрузка...</div>
  }

  const txTotalPages = Math.ceil(transactionsTotal / 20)
  const wdTotalPages = Math.ceil(withdrawalsTotal / 20)

  return (
    <div className="max-w-4xl space-y-6">
      {/* Balance & Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="w-4 h-4 text-blue-600" />
              <p className="text-xs text-gray-500">Баланс</p>
            </div>
            <p className="text-xl font-bold text-gray-900">
              {(summary?.balance ?? 0).toLocaleString('ru-RU', { minimumFractionDigits: 2 })} ₽
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <ArrowDownToLine className="w-4 h-4 text-green-600" />
              <p className="text-xs text-gray-500">Поступления</p>
            </div>
            <p className="text-xl font-bold text-green-700">
              {(summary?.totalIncome ?? 0).toLocaleString('ru-RU', { minimumFractionDigits: 2 })} ₽
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <ArrowUpFromLine className="w-4 h-4 text-orange-600" />
              <p className="text-xs text-gray-500">Выведено</p>
            </div>
            <p className="text-xl font-bold text-gray-700">
              {(summary?.totalWithdrawn ?? 0).toLocaleString('ru-RU', { minimumFractionDigits: 2 })} ₽
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-gray-500" />
              <p className="text-xs text-gray-500">Комиссия</p>
            </div>
            <p className="text-xl font-bold text-gray-500">
              {(summary?.totalCommission ?? 0).toLocaleString('ru-RU', { minimumFractionDigits: 2 })} ₽
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Withdrawal button */}
      {summary && summary.balance > 0 && (
        <div className="flex items-center gap-3">
          <Button onClick={handleRequestWithdrawal} disabled={requestingWithdrawal}>
            {requestingWithdrawal ? (
              <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Запрос...</>
            ) : (
              <><ArrowUpFromLine className="w-4 h-4 mr-1.5" /> Запросить вывод {summary.balance.toLocaleString('ru-RU')} ₽</>
            )}
          </Button>
          {withdrawalError && (
            <p className="text-sm text-red-600">{withdrawalError}</p>
          )}
        </div>
      )}

      {/* View toggle */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveView('transactions')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeView === 'transactions'
              ? 'border-gray-900 text-gray-900'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Транзакции ({transactionsTotal})
        </button>
        <button
          onClick={() => setActiveView('withdrawals')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeView === 'withdrawals'
              ? 'border-gray-900 text-gray-900'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Выводы ({withdrawalsTotal})
        </button>
      </div>

      {/* Transactions View */}
      {activeView === 'transactions' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Тип</label>
              <select
                value={txTypeFilter}
                onChange={(e) => { setTxTypeFilter(e.target.value); setTxPage(1) }}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">Все</option>
                <option value="payment_incoming">Оплата</option>
                <option value="commission_deduction">Комиссия</option>
                <option value="refund">Возврат</option>
                <option value="withdrawal_requested">Вывод</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">От</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setTxPage(1) }}
                className="w-36 h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">До</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setTxPage(1) }}
                className="w-36 h-8 text-sm"
              />
            </div>
          </div>

          {/* Table */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Дата</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Тип</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Описание</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Сумма</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Баланс</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      Транзакций пока нет
                    </td>
                  </tr>
                ) : (
                  transactions.map(tx => (
                    <tr key={tx.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-600 whitespace-nowrap">
                        {formatDate(tx.created_at)}
                      </td>
                      <td className="px-4 py-2 text-gray-700 whitespace-nowrap">
                        {TRANSACTION_LABELS[tx.type] || tx.type}
                      </td>
                      <td className="px-4 py-2 text-gray-600 max-w-[200px] truncate">
                        {tx.description || '—'}
                      </td>
                      <td className={`px-4 py-2 text-right whitespace-nowrap font-medium ${
                        tx.amount > 0 ? 'text-green-700' : tx.amount < 0 ? 'text-red-600' : 'text-gray-500'
                      }`}>
                        {formatAmount(tx.amount, tx.currency)}
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap text-gray-600">
                        {tx.balance_after.toLocaleString('ru-RU', { minimumFractionDigits: 2 })} ₽
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {txTotalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Стр. {txPage} из {txTotalPages} ({transactionsTotal} записей)
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={txPage <= 1} onClick={() => setTxPage(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={txPage >= txTotalPages} onClick={() => setTxPage(p => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Withdrawals View */}
      {activeView === 'withdrawals' && (
        <div className="space-y-4">
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Дата запроса</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Статус</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Сумма</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Акт</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Выполнен</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {withdrawals.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      Выводов пока нет
                    </td>
                  </tr>
                ) : (
                  withdrawals.map(wd => {
                    const statusInfo = WITHDRAWAL_STATUS_LABELS[wd.status] || { label: wd.status, color: '' }
                    return (
                      <tr key={wd.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-600 whitespace-nowrap">
                          {formatDate(wd.requested_at)}
                        </td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusInfo.color}`}>
                            {statusInfo.label}
                          </span>
                          {wd.rejection_reason && (
                            <p className="text-xs text-red-500 mt-1">{wd.rejection_reason}</p>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right whitespace-nowrap font-medium text-gray-900">
                          {wd.net_amount.toLocaleString('ru-RU', { minimumFractionDigits: 2 })} ₽
                        </td>
                        <td className="px-4 py-2">
                          {wd.act_document_url ? (
                            <a
                              href={wd.act_document_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                            >
                              <Download className="w-3 h-3" />
                              {wd.act_number || 'Скачать'}
                            </a>
                          ) : wd.act_number ? (
                            <span className="text-xs text-gray-500">{wd.act_number}</span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-gray-600 whitespace-nowrap text-sm">
                          {wd.completed_at ? formatDate(wd.completed_at) : '—'}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {wdTotalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Стр. {wdPage} из {wdTotalPages}
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={wdPage <= 1} onClick={() => setWdPage(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={wdPage >= wdTotalPages} onClick={() => setWdPage(p => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
