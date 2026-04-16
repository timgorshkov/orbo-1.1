'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, FileText, Loader2, RefreshCw } from 'lucide-react'

interface InvoiceRow {
  id: string
  org_id: string
  org_name: string | null
  amount: number | string
  currency: string
  status: string
  period_start: string
  period_end: string
  paid_at: string | null
  customer_type: string | null
  customer_name: string | null
  customer_email: string | null
  legacy_act_number: string | null
  legacy_act_url: string | null
  licensee_full_name: string | null
  licensee_email: string | null
  plan_code: string | null
  plan_name: string | null
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ru-RU')
}

function formatAmount(v: number | string, currency: string): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  const sym = currency === 'RUB' ? '₽' : currency
  return `${n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${sym}`
}

export default function InvoicesWithoutActPanel({ onRegenerated }: { onRegenerated?: () => void }) {
  const [rows, setRows] = useState<InvoiceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [result, setResult] = useState<{ id: string; message: string; success: boolean } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/superadmin/accounting/invoices-without-act')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
      setRows(data.invoices || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleRegenerate = useCallback(
    async (row: InvoiceRow) => {
      const confirmed = window.confirm(
        `Перегенерировать акт для инвойса ${formatAmount(row.amount, row.currency)} ` +
        `(${row.org_name || row.org_id.slice(0, 8)}, ${formatDate(row.period_start)} — ${formatDate(row.period_end)})?\n\n` +
        `Старая ссылка на акт (если была) будет заменена. Если покупатель — юрлицо или ИП, акт автоматически уйдёт в Контур.Эльбу.`
      )
      if (!confirmed) return

      setBusyId(row.id)
      setError(null)
      setResult(null)
      try {
        const res = await fetch(`/api/superadmin/invoices/${row.id}/regenerate-act`, {
          method: 'POST',
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Ошибка перегенерации')
        const message = data.skipped
          ? `Акт для физлица пропущен (${data.skipped}). Если нужно обязательно создать — проверьте customer_type и licensee.`
          : `Акт ${data.newActNumber} сформирован${data.htmlUrl ? ' и загружен в S3' : ''}. Отправка в Эльбу — fire-and-forget, проверьте статус в таблице ниже.`
        setResult({ id: row.id, message, success: true })
        if (onRegenerated) onRegenerated()
        await load()
      } catch (e: any) {
        setResult({ id: row.id, message: e.message, success: false })
      } finally {
        setBusyId(null)
      }
    },
    [load, onRegenerated]
  )

  if (!loading && rows.length === 0 && !error) {
    return null // нет инвойсов без акта — блок не показываем
  }

  return (
    <div className="bg-white rounded-xl border border-orange-200 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-600" />
            Оплаченные инвойсы без акта
          </h3>
          <p className="text-sm text-gray-600">
            Инвойсы со статусом «Оплачен», у которых нет связанной записи в{' '}
            <code className="bg-gray-100 px-1 rounded text-xs">accounting_documents</code>.
            Нажмите «Перегенерировать», чтобы создать акт с текущими реквизитами лицензиата
            и автоматически отправить его в Эльбу (для юрлиц/ИП).
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium disabled:opacity-50"
          type="button"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div
          className={`rounded-lg p-3 text-sm flex items-start gap-2 ${
            result.success
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {result.success ? (
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          )}
          <div>{result.message}</div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-700">Оплачен</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700">Организация</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700">Тариф / период</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700">Лицензиат</th>
              <th className="px-3 py-2 text-right font-medium text-gray-700">Сумма</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700">Legacy акт</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin inline" /> Загрузка...
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const busy = busyId === r.id
              const licenseeName =
                r.licensee_full_name ||
                (r.customer_type === 'individual' ? r.customer_name : null) ||
                '—'
              const licenseeEmail = r.licensee_email || r.customer_email || null
              return (
                <tr key={r.id} className="hover:bg-gray-50 align-top">
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600">
                    {formatDate(r.paid_at)}
                  </td>
                  <td className="px-3 py-2">{r.org_name || r.org_id.slice(0, 8)}</td>
                  <td className="px-3 py-2 text-xs">
                    <div>{r.plan_name || r.plan_code || '—'}</div>
                    <div className="text-gray-500">
                      {formatDate(r.period_start)} — {formatDate(r.period_end)}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div>{licenseeName}</div>
                    {licenseeEmail && (
                      <div className="text-gray-500">{licenseeEmail}</div>
                    )}
                    <div className="text-gray-400 text-[10px]">{r.customer_type || '—'}</div>
                  </td>
                  <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                    {formatAmount(r.amount, r.currency)}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.legacy_act_number ? (
                      <a
                        href={r.legacy_act_url || undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700"
                        title="Старый акт (legacy)"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {r.legacy_act_number}
                      </a>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => handleRegenerate(r)}
                      disabled={busy}
                      className="flex items-center gap-1 px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-md text-xs font-medium disabled:opacity-50"
                      type="button"
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      Перегенерировать
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
