'use client'

/**
 * Income Ledger Panel — period-based view of Orbo's USN 6% taxable income.
 *
 * Shows a daily summary table for the chosen period, plus four export buttons:
 *   - Книга доходов (для Эльбы)         — daily aggregation, recommended
 *   - Реестр транзакций (для камералки) — full org_transactions list
 *   - Реестр выводов                    — payouts to organizers
 *   - Реестр возвратов                  — refunds + commission reversals
 *
 * Server endpoints: /api/superadmin/finances?view=income-ledger,
 *                   /api/superadmin/finances/export?type=…
 */

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, Loader2, Calendar, FlaskConical } from 'lucide-react'

type IncomeKind = 'service_fee' | 'agent_commission' | 'subscription' | 'service_fee_refund' | 'agent_commission_refund'

interface DayRow {
  date: string
  total: number
  byKind: Partial<Record<IncomeKind, number>>
  byGateway: Record<string, number>
}

interface LedgerLine {
  date: string
  recognisedAt: string
  kind: IncomeKind
  kindLabel: string
  amount: number
  contractor: string
  orgName: string | null
  eventTitle: string | null
  documentNumber: string | null
  paymentSessionId: string | null
  isTest: boolean
  sourceTable: string
  sourceId: string
  gatewayCode: string | null
}

interface Summary {
  periodFrom: string
  periodTo: string
  totalAmount: number
  byKind: Record<IncomeKind, number>
  byGateway: Record<string, number>
  byDay: DayRow[]
  lineCount: number
}

const KIND_HEADERS: Array<{ key: IncomeKind; label: string }> = [
  { key: 'service_fee', label: 'Сервисный сбор' },
  { key: 'agent_commission', label: 'Агентское вознагр.' },
  { key: 'subscription', label: 'Тарифы' },
  { key: 'service_fee_refund', label: 'Возвр. сборов' },
  { key: 'agent_commission_refund', label: 'Возвр. комиссии' },
]

/**
 * Display order and labels for acquiring gateways. Anything outside of this
 * list (e.g. 'manual', 'yookassa', 'unknown' for legacy rows w/o session link)
 * shows up as an extra column in the "Other" slot — keeps the report honest
 * even if a stray gateway sneaks in.
 */
const GATEWAY_LABELS: Record<string, string> = {
  tbank: 'T-Bank',
  cloudpayments: 'CP',
  yookassa: 'YooKassa',
  manual: 'Ручные',
  // gateway_code IS NULL — обычно это платёж на расчётный счёт банка
  // (verification fee, ручные сверки), не через эквайринг.
  unknown: 'Р/Сч',
}

function gatewayLabel(code: string): string {
  return GATEWAY_LABELS[code] || code
}

function defaultPeriod(): { from: string; to: string } {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const lastDay = new Date(yyyy, now.getMonth() + 1, 0).getDate()
  return { from: `${yyyy}-${mm}-01`, to: `${yyyy}-${mm}-${String(lastDay).padStart(2, '0')}` }
}

function fmt(n: number | undefined | null): string {
  if (!n) return '—'
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

export default function IncomeLedgerPanel() {
  const def = defaultPeriod()
  const [from, setFrom] = useState(def.from)
  const [to, setTo] = useState(def.to)
  const [includeTest, setIncludeTest] = useState(false)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [lines, setLines] = useState<LedgerLine[]>([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exportingType, setExportingType] = useState<string | null>(null)
  const [markingId, setMarkingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ view: 'income-ledger', from, to })
      if (includeTest) params.set('includeTest', '1')
      const res = await fetch(`/api/superadmin/finances?${params.toString()}`)
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.error || 'Failed to load')
      }
      const data = await res.json()
      setSummary(data.summary)
      setLines(data.lines || [])
      setTruncated(!!data.truncated)
    } catch (e: any) {
      setError(e.message || 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }, [from, to, includeTest])

  useEffect(() => { load() }, [load])

  const markAsTest = async (paymentSessionId: string, isTest: boolean) => {
    setMarkingId(paymentSessionId)
    try {
      const res = await fetch('/api/superadmin/finances/mark-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentSessionId, isTest }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.error || 'Failed to mark')
      }
      await load() // reload to reflect change
    } catch (e: any) {
      setError(e.message || 'Не удалось отметить')
    } finally {
      setMarkingId(null)
    }
  }

  const downloadXlsx = async (type: 'income-ledger' | 'transactions' | 'withdrawals' | 'refunds') => {
    setExportingType(type)
    try {
      const params = new URLSearchParams({ type, from, to })
      if (includeTest && type === 'income-ledger') params.set('includeTest', '1')
      const url = `/api/superadmin/finances/export?${params.toString()}`
      const res = await fetch(url)
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: 'Export failed' }))
        throw new Error(e.error)
      }
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      // Filename comes from Content-Disposition; fallback if browser strips it
      a.download = `orbo-${type}_${from}_${to}.xlsx`
      a.click()
      setTimeout(() => URL.revokeObjectURL(objectUrl), 100)
    } catch (e: any) {
      setError(e.message || 'Не удалось выгрузить')
    } finally {
      setExportingType(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Книга доходов ОРБО (УСН 6%)
        </CardTitle>
        <p className="text-sm text-gray-500 mt-1">
          Признание выручки по кассовому методу за выбранный период: сервисный сбор,
          агентское вознаграждение, лицензионные платежи. Не включает средства принципалов.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Period filter */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">С</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">По</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Обновить'}
          </Button>
          <label className="ml-auto flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeTest}
              onChange={(e) => setIncludeTest(e.target.checked)}
              className="w-4 h-4"
            />
            Показать тестовые
          </label>
        </div>

        {error && (
          <div className="text-sm text-red-600 p-3 bg-red-50 border border-red-200 rounded-lg">{error}</div>
        )}

        {/* Summary */}
        {summary && (
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-baseline gap-4">
              <div>
                <div className="text-xs text-gray-500">Итого доходов за период</div>
                <div className="text-2xl font-semibold text-gray-900">{fmt(summary.totalAmount)} ₽</div>
              </div>
              <div className="text-xs text-gray-500 ml-auto">Записей: {summary.lineCount}</div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
              {KIND_HEADERS.map((k) => (
                <div key={k.key} className="border-l-2 border-gray-300 pl-3">
                  <div className="text-xs text-gray-500">{k.label}</div>
                  <div className="font-medium text-gray-900">{fmt(summary.byKind[k.key])} ₽</div>
                </div>
              ))}
            </div>
            {/* By gateway: each acquirer settles to a separate bank account, so
                the bookkeeper reconciles each total against its own settlement. */}
            {Object.keys(summary.byGateway).length > 0 && (
              <div className="pt-2 border-t border-gray-200">
                <div className="text-xs text-gray-500 mb-2">Из них поступило через эквайринг (для сверки с банком)</div>
                <div className="flex flex-wrap gap-3 text-sm">
                  {Object.entries(summary.byGateway)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([gw, val]) => (
                      <div key={gw} className="px-3 py-1.5 rounded bg-white border border-gray-200">
                        <span className="text-gray-500 mr-1.5">{gatewayLabel(gw)}:</span>
                        <span className="font-medium text-gray-900">{fmt(val)} ₽</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* By-day table */}
        {summary && summary.byDay.length > 0 && (() => {
          const gatewayKeys = Object.keys(summary.byGateway).sort()
          return (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 pr-4 font-medium text-gray-600">Дата</th>
                    {KIND_HEADERS.map((k) => (
                      <th key={k.key} className="text-right py-2 px-2 font-medium text-gray-600 whitespace-nowrap">{k.label}</th>
                    ))}
                    {gatewayKeys.map((gw) => (
                      <th key={gw} className="text-right py-2 px-2 font-medium text-blue-700 whitespace-nowrap border-l border-gray-200">
                        через {gatewayLabel(gw)}
                      </th>
                    ))}
                    <th className="text-right py-2 pl-2 font-medium text-gray-900 whitespace-nowrap">Итого</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byDay.map((d) => (
                    <tr key={d.date} className="border-b border-gray-100">
                      <td className="py-1.5 pr-4 text-gray-700">{d.date}</td>
                      {KIND_HEADERS.map((k) => (
                        <td key={k.key} className="text-right py-1.5 px-2 text-gray-600">{fmt(d.byKind[k.key])}</td>
                      ))}
                      {gatewayKeys.map((gw) => (
                        <td key={gw} className="text-right py-1.5 px-2 text-blue-700 border-l border-gray-100">
                          {fmt(d.byGateway?.[gw])}
                        </td>
                      ))}
                      <td className="text-right py-1.5 pl-2 font-medium text-gray-900">{fmt(d.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {truncated && (
                <p className="text-xs text-gray-400 mt-2">
                  Показаны не все записи (более 500). Полный реестр — в выгрузке XLSX.
                </p>
              )}
            </div>
          )
        })()}

        {summary && summary.byDay.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-6">За выбранный период доходов нет.</p>
        )}

        {/* Detailed list with mark-as-test button */}
        {lines.length > 0 && (
          <details className="border-t border-gray-100 pt-3">
            <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-900">
              Детализация ({lines.length} строк) — для пометки тестовых транзакций
            </summary>
            <div className="overflow-x-auto mt-3">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-600">
                    <th className="text-left py-1.5 pr-2">Дата</th>
                    <th className="text-left py-1.5 pr-2">Тип</th>
                    <th className="text-right py-1.5 pr-2">Сумма ₽</th>
                    <th className="text-left py-1.5 pr-2">Шлюз</th>
                    <th className="text-left py-1.5 pr-2">Контрагент</th>
                    <th className="text-left py-1.5 pr-2">Событие/Документ</th>
                    <th className="py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={`${l.sourceTable}-${l.sourceId}`} className={`border-b border-gray-50 ${l.isTest ? 'bg-amber-50' : ''}`}>
                      <td className="py-1 pr-2 text-gray-700">{l.date}</td>
                      <td className="py-1 pr-2 text-gray-700">{l.kindLabel}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{fmt(l.amount)}</td>
                      <td className="py-1 pr-2 text-gray-600">{l.gatewayCode ? gatewayLabel(l.gatewayCode) : '—'}</td>
                      <td className="py-1 pr-2 text-gray-600 truncate max-w-[200px]">{l.contractor}</td>
                      <td className="py-1 pr-2 text-gray-500 truncate max-w-[280px]">
                        {l.documentNumber || l.eventTitle || l.orgName || '—'}
                      </td>
                      <td className="py-1 text-right">
                        {l.paymentSessionId && (
                          <button
                            type="button"
                            onClick={() => markAsTest(l.paymentSessionId!, !l.isTest)}
                            disabled={markingId === l.paymentSessionId}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded transition-colors ${
                              l.isTest
                                ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                                : 'text-gray-500 hover:bg-gray-100'
                            }`}
                            title={l.isTest ? 'Снять метку тестовой' : 'Пометить как тестовую (исключить из доходов)'}
                          >
                            {markingId === l.paymentSessionId
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <FlaskConical className="w-3 h-3" />}
                            {l.isTest ? 'тест' : ''}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}

        {/* Export buttons */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
          <Button size="sm" onClick={() => downloadXlsx('income-ledger')} disabled={!!exportingType}>
            {exportingType === 'income-ledger' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Книга доходов
          </Button>
          <Button size="sm" variant="outline" onClick={() => downloadXlsx('transactions')} disabled={!!exportingType}>
            {exportingType === 'transactions' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Реестр транзакций
          </Button>
          <Button size="sm" variant="outline" onClick={() => downloadXlsx('withdrawals')} disabled={!!exportingType}>
            {exportingType === 'withdrawals' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Реестр выводов
          </Button>
          <Button size="sm" variant="outline" onClick={() => downloadXlsx('refunds')} disabled={!!exportingType}>
            {exportingType === 'refunds' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Реестр возвратов
          </Button>
        </div>

        <div className="text-xs text-gray-500 leading-relaxed">
          <strong>Назначение выгрузок:</strong> «Книга доходов» — для ввода в Контур.Эльбу
          (соответствует УСН 6% по кассовому методу). «Реестр транзакций» — полный список
          операций для камеральной налоговой проверки и сверки с банковской выпиской.
        </div>
      </CardContent>
    </Card>
  )
}
