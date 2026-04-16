'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Download, Loader2, Play, RefreshCw, XCircle } from 'lucide-react'

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
  lines: EventLine[]
  payments: PaymentDetail[]
  lastActPeriodEnd: string | null
  /** День, с которого ОБЯЗАН начинаться следующий акт (если уже есть прошлый). */
  requiredFrom: string | null
}

interface GenerateResponse {
  documentId: string
  docNumber: string
  docDate: string
  htmlUrl: string | null
  totalAmount: number
  paymentsCount: number
  eventsCount: number
  elbaSyncStatus: 'synced' | 'failed'
  elbaDocumentId: string | null
  elbaUrl: string | null
  elbaError: string | null
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

function yesterdayISO(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  d.setHours(12, 0, 0, 0)
  return d.toISOString().split('T')[0]
}

function normalizeISODate(s: string | null | undefined): string | null {
  if (!s) return null
  const m = String(s).match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

function firstDayOfMonthISO(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]
}

async function downloadArchive(documentId: string, docNumber: string) {
  const res = await fetch(`/api/superadmin/accounting/retail-act/${documentId}/archive`)
  if (!res.ok) {
    const msg = await res.json().catch(() => ({ error: 'Ошибка скачивания' }))
    throw new Error(msg.error || 'Ошибка скачивания архива')
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const safe = docNumber.replace(/[^a-zA-Zа-яА-ЯёЁ0-9-]/g, '_')
  a.download = `retail-act-${safe}.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function RetailActPanel({ onGenerated }: { onGenerated?: () => void }) {
  const defaultTo = useMemo(yesterdayISO, [])

  const [from, setFrom] = useState(firstDayOfMonthISO())
  const [to, setTo] = useState(defaultTo)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [lastGenerated, setLastGenerated] = useState<GenerateResponse | null>(null)
  const [lastPeriodEnd, setLastPeriodEnd] = useState<string | null>(null)
  const [requiredFrom, setRequiredFrom] = useState<string | null>(null)
  const todayStr = useMemo(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().split('T')[0]
  }, [])
  const maxTo = todayStr
  const effectiveFrom = requiredFrom || from
  const fromLocked = !!requiredFrom
  const isInvalidRange = !!effectiveFrom && (!to || to < effectiveFrom || to > maxTo)

  const loadPreview = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const queryFrom = requiredFrom || from
      const params = new URLSearchParams({ from: queryFrom, to })
      const res = await fetch(`/api/superadmin/accounting/retail-act/preview?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка предпросмотра')
      setPreview(data)
      setLastPeriodEnd(normalizeISODate(data.lastActPeriodEnd))
      const nextRequired = normalizeISODate(data.requiredFrom)
      setRequiredFrom(nextRequired)
      if (nextRequired && from !== nextRequired) {
        setFrom(nextRequired)
      }
    } catch (e: any) {
      setError(e.message)
      setPreview(null)
    } finally {
      setLoading(false)
    }
  }, [from, to, requiredFrom])

  useEffect(() => {
    loadPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleGenerate = useCallback(async () => {
    if (!preview) return
    if (preview.paymentsCount === 0) return
    if (isInvalidRange) return
    const startDate = effectiveFrom
    const confirmed = window.confirm(
      `Сформировать акт об оказании услуг за период ${formatDate(startDate)} — ${formatDate(to)}?\n\n` +
      `Платежей: ${preview.paymentsCount}\n` +
      `Сумма: ${formatMoney(preview.totalAmount)} ₽\n\n` +
      `После подтверждения акт будет отправлен в Контур.Эльбу.`
    )
    if (!confirmed) return

    setGenerating(true)
    setError(null)
    setLastGenerated(null)
    try {
      const res = await fetch('/api/superadmin/accounting/retail-act/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: startDate, to }),
      })
      const data: GenerateResponse | { error: string } = await res.json()
      if (!res.ok) {
        throw new Error(('error' in data && data.error) || 'Ошибка формирования акта')
      }
      const ok = data as GenerateResponse
      setLastGenerated(ok)
      const elbaMsg =
        ok.elbaSyncStatus === 'synced'
          ? 'Акт отправлен в Эльбу.'
          : `Акт сохранён, но отправка в Эльбу не прошла: ${ok.elbaError || 'неизвестная ошибка'}. Попробуйте повторить.`
      setSuccessMessage(
        `Сформирован ${ok.docNumber} на сумму ${formatMoney(ok.totalAmount)} ₽ (${ok.paymentsCount} платежей). ${elbaMsg}`
      )
      // Автоматическое скачивание архива — акт + реестр
      try {
        await downloadArchive(ok.documentId, ok.docNumber)
      } catch (dlErr: any) {
        setError(`Документ сформирован, но архив не скачался: ${dlErr.message}`)
      }
      if (onGenerated) onGenerated()
      await loadPreview()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setGenerating(false)
    }
  }, [preview, effectiveFrom, to, loadPreview, onGenerated, isInvalidRange])

  const handleResend = useCallback(async () => {
    if (!lastGenerated) return
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch(`/api/superadmin/accounting/retail-act/${lastGenerated.documentId}/resend`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка переотправки')
      if (data.elbaSyncStatus === 'synced') {
        setLastGenerated({ ...lastGenerated, ...data })
        setSuccessMessage(`Акт ${lastGenerated.docNumber} успешно отправлен в Эльбу.`)
      } else {
        setError(`Повторная отправка не удалась: ${data.elbaError || 'неизвестная ошибка'}`)
      }
      if (onGenerated) onGenerated()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setGenerating(false)
    }
  }, [lastGenerated, onGenerated])

  const handleDownloadAgain = useCallback(async () => {
    if (!lastGenerated) return
    try {
      await downloadArchive(lastGenerated.documentId, lastGenerated.docNumber)
    } catch (e: any) {
      setError(e.message)
    }
  }, [lastGenerated])

  return (
    <div className="bg-white rounded-xl border border-purple-200 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Акт об оказании услуг (АУ) на «Розничные покупатели»
          </h3>
          <p className="text-sm text-gray-600">
            Сводный документ Орбо о выручке за сервисный сбор с физлиц-участников.
            Автоматически отправляется в Контур.Эльбу и скачивается в виде архива
            (акт + реестр-расшифровка).
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {lastPeriodEnd ? (
              <>
                Последний акт покрывает период до{' '}
                <strong>{formatDate(lastPeriodEnd)}</strong>. Следующий обязан начинаться с{' '}
                <strong>{formatDate(requiredFrom)}</strong> — задним числом и с разрывом
                сформировать нельзя.
              </>
            ) : (
              <>Это будет первый акт. Стартовая дата выбирается свободно.</>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Период с {fromLocked && <span className="text-gray-400">(зафиксировано)</span>}
          </label>
          <input
            type="date"
            value={effectiveFrom}
            min={fromLocked ? effectiveFrom : undefined}
            max={fromLocked ? effectiveFrom : maxTo}
            onChange={(e) => !fromLocked && setFrom(e.target.value)}
            disabled={fromLocked}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:text-gray-600"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">по (включительно)</label>
          <input
            type="date"
            value={to}
            min={effectiveFrom}
            max={maxTo}
            onChange={(e) => setTo(e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg text-sm ${
              isInvalidRange ? 'border-red-300 bg-red-50' : 'border-gray-300'
            }`}
          />
          {isInvalidRange && (
            <div className="text-xs text-red-600 mt-1">
              {to && to < effectiveFrom && `Не раньше ${formatDate(effectiveFrom)}.`}
              {to && to > maxTo && `Не позже ${formatDate(maxTo)}.`}
            </div>
          )}
        </div>
        <button
          onClick={loadPreview}
          disabled={loading || isInvalidRange}
          className="flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium disabled:opacity-50"
          type="button"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Пересчитать
        </button>
        <button
          onClick={handleGenerate}
          disabled={
            generating || loading || isInvalidRange || !preview || preview.paymentsCount === 0
          }
          className="flex items-center justify-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          type="button"
          title="Сформировать акт, отправить в Эльбу и скачать архив"
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Сформировать и отправить
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

      {lastGenerated && (
        <div className="border border-purple-200 rounded-lg p-3 bg-purple-50/50 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            {lastGenerated.elbaSyncStatus === 'synced' ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>
                  <strong>{lastGenerated.docNumber}</strong> — зарегистрирован в Эльбе.
                </span>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-red-600" />
                <span>
                  <strong>{lastGenerated.docNumber}</strong> — акт сохранён, но в Эльбу не ушёл.
                </span>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleDownloadAgain}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-purple-300 hover:bg-purple-100 rounded-lg text-xs font-medium"
              type="button"
            >
              <Download className="h-3.5 w-3.5" />
              Скачать архив снова
            </button>
            {lastGenerated.elbaUrl && (
              <a
                href={lastGenerated.elbaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-purple-300 hover:bg-purple-100 rounded-lg text-xs font-medium text-purple-700"
              >
                Открыть в Эльбе ↗
              </a>
            )}
            {lastGenerated.elbaSyncStatus === 'failed' && (
              <button
                onClick={handleResend}
                disabled={generating}
                className="flex items-center gap-2 px-3 py-1.5 bg-orange-100 hover:bg-orange-200 rounded-lg text-xs font-medium text-orange-800 disabled:opacity-50"
                type="button"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${generating ? 'animate-spin' : ''}`} />
                Повторить отправку в Эльбу
              </button>
            )}
          </div>
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
              За выбранный период сервисных сборов не было. Акт не будет сформирован.
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
                    {preview.lines.map((line, idx) => (
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
