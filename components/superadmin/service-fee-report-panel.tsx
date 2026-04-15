'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileText, Loader2, Play, RefreshCw } from 'lucide-react'

interface EventLine {
  eventId: string | null
  eventTitle: string
  orgName: string | null
  paymentsCount: number
  totalAmount: number
  paymentIds: string[]
}

interface PaymentDetail {
  income_id: string
  payment_session_id: string | null
  event_registration_id: string | null
  amount: number
  created_at: string
  event_id: string | null
  event_title: string | null
  org_id: string
  org_name: string | null
}

interface PreviewResponse {
  periodStart: string
  periodEnd: string
  totalAmount: number
  paymentsCount: number
  eventsCount: number
  eventLines: EventLine[]
  payments: PaymentDetail[]
  lastReportPeriodEnd: string | null
}

interface GenerateResponse {
  documentId: string
  docNumber: string
  docDate: string
  htmlUrl: string | null
  totalAmount: number
  paymentsCount: number
  eventsCount: number
}

function formatMoney(v: number): string {
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ru-RU')
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU')
}

function todayISO(): string {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  return d.toISOString().split('T')[0]
}

function yesterdayISO(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  d.setHours(12, 0, 0, 0)
  return d.toISOString().split('T')[0]
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

function firstDayOfMonthISO(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]
}

export default function ServiceFeeReportPanel({ onGenerated }: { onGenerated?: () => void }) {
  const defaultTo = useMemo(yesterdayISO, [])

  const [from, setFrom] = useState(firstDayOfMonthISO())
  const [to, setTo] = useState(defaultTo)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [lastPeriodEnd, setLastPeriodEnd] = useState<string | null>(null)

  // Подтягиваем last period_end из сервера при первом рендере — сразу же
  // через запрос preview с текущим диапазоном. Серверу это дешевле, чем
  // отдельный эндпоинт.
  const loadPreview = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const params = new URLSearchParams({ from, to })
      const res = await fetch(`/api/superadmin/accounting/service-fee-report/preview?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка предпросмотра')
      setPreview(data)
      setLastPeriodEnd(data.lastReportPeriodEnd || null)
    } catch (e: any) {
      setError(e.message)
      setPreview(null)
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => {
    loadPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyDefaultFromLastPeriod = useCallback(() => {
    if (!lastPeriodEnd) {
      setFrom(firstDayOfMonthISO())
      return
    }
    setFrom(addDaysISO(lastPeriodEnd, 1))
  }, [lastPeriodEnd])

  useEffect(() => {
    // При изменении lastPeriodEnd после первого preview — если from ещё «первое число месяца»
    // и есть более актуальная дата — подменим мягко на неё.
    if (lastPeriodEnd && from === firstDayOfMonthISO()) {
      const next = addDaysISO(lastPeriodEnd, 1)
      if (next > from) setFrom(next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastPeriodEnd])

  const handleGenerate = useCallback(async () => {
    if (!preview) return
    if (preview.paymentsCount === 0) return
    const confirmed = window.confirm(
      `Сформировать ОРП за период ${formatDate(from)} — ${formatDate(to)}?\n\nПлатежей: ${preview.paymentsCount}\nСумма: ${formatMoney(preview.totalAmount)} ₽`
    )
    if (!confirmed) return

    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/superadmin/accounting/service-fee-report/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
      })
      const data: GenerateResponse | { error: string } = await res.json()
      if (!res.ok) {
        throw new Error(('error' in data && data.error) || 'Ошибка формирования ОРП')
      }
      const ok = data as GenerateResponse
      setSuccessMessage(
        `Сформирован ${ok.docNumber} на сумму ${formatMoney(ok.totalAmount)} ₽ (${ok.paymentsCount} платежей).`
      )
      if (onGenerated) onGenerated()
      await loadPreview()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setGenerating(false)
    }
  }, [preview, from, to, loadPreview, onGenerated])

  return (
    <div className="bg-white rounded-xl border border-purple-200 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Отчёт о розничных продажах (ОРП)
          </h3>
          <p className="text-sm text-gray-600">
            Сводный документ Орбо о выручке за сервисный сбор с физлиц-участников.
            Используется для учёта в КУДиР и импорта в Эльбу.
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Последний сформированный ОРП покрывает период до{' '}
            <strong>{formatDate(lastPeriodEnd)}</strong>.
            {lastPeriodEnd && (
              <>
                {' '}
                <button
                  onClick={applyDefaultFromLastPeriod}
                  className="text-purple-600 hover:underline"
                  type="button"
                >
                  Продолжить с {formatDate(addDaysISO(lastPeriodEnd, 1))}
                </button>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Период с</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">по (включительно)</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <button
          onClick={loadPreview}
          disabled={loading}
          className="flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium disabled:opacity-50"
          type="button"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Пересчитать
        </button>
        <button
          onClick={handleGenerate}
          disabled={generating || loading || !preview || preview.paymentsCount === 0}
          className="flex items-center justify-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          type="button"
          title="Сформировать ОРП и сохранить в accounting_documents"
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Сформировать ОРП
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
          {successMessage}
        </div>
      )}

      {preview && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 text-xs text-gray-700 flex flex-wrap gap-4">
            <div>
              <span className="text-gray-500">Платежей:</span>{' '}
              <strong>{preview.paymentsCount}</strong>
            </div>
            <div>
              <span className="text-gray-500">Мероприятий:</span>{' '}
              <strong>{preview.eventsCount}</strong>
            </div>
            <div>
              <span className="text-gray-500">Сумма к включению:</span>{' '}
              <strong>{formatMoney(preview.totalAmount)} ₽</strong>
            </div>
          </div>

          {preview.paymentsCount === 0 ? (
            <div className="p-4 text-sm text-gray-500">
              За выбранный период сервисных сборов не было. Документ не будет сформирован.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Мероприятие</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Организатор</th>
                      <th className="px-4 py-2 text-center font-medium text-gray-700">Оплат</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-700">Сумма, ₽</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.eventLines.map((line, idx) => (
                      <tr key={`${line.eventId || 'no_event'}-${idx}`} className="hover:bg-gray-50">
                        <td className="px-4 py-2">{line.eventTitle}</td>
                        <td className="px-4 py-2 text-xs text-gray-600">{line.orgName || '—'}</td>
                        <td className="px-4 py-2 text-center">{line.paymentsCount}</td>
                        <td className="px-4 py-2 text-right font-medium">
                          {formatMoney(line.totalAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <details className="border-t border-gray-200">
                <summary className="px-4 py-2 cursor-pointer text-xs text-gray-600 hover:bg-gray-50">
                  Показать детализацию по каждой оплате ({preview.payments.length})
                </summary>
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">Дата/время</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">Мероприятие</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">Организатор</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-700">Сумма, ₽</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">Session</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {preview.payments.map((p) => (
                        <tr key={p.income_id}>
                          <td className="px-4 py-1.5 whitespace-nowrap">
                            {formatDateTime(p.created_at)}
                          </td>
                          <td className="px-4 py-1.5">{p.event_title || '—'}</td>
                          <td className="px-4 py-1.5 text-gray-600">{p.org_name || '—'}</td>
                          <td className="px-4 py-1.5 text-right font-medium">
                            {formatMoney(p.amount)}
                          </td>
                          <td className="px-4 py-1.5 font-mono text-[10px] text-gray-500">
                            {p.payment_session_id ? p.payment_session_id.slice(0, 8) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          )}
        </div>
      )}
    </div>
  )
}
