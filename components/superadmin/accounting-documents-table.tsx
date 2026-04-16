'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Download, FileText, Loader2, RefreshCw, XCircle } from 'lucide-react'

interface DocRow {
  id: string
  doc_type: 'subscription_act' | 'agent_commission_upd' | 'retail_act'
  doc_number: string
  doc_date: string
  period_start: string | null
  period_end: string | null
  org_id: string | null
  org_name: string | null
  customer_type: string
  customer_name: string | null
  customer_inn: string | null
  total_amount: string | number
  currency: string
  status: string
  html_url: string | null
  elba_document_id: string | null
  elba_url: string | null
  elba_sync_status: 'pending' | 'synced' | 'failed' | null
  elba_error: string | null
  created_at: string
}

interface Aggregates {
  total_count: number
  total_sum: string | number
  subscription_acts_count: number
  commission_upds_count: number
  retail_acts_count: number
}

const DOC_TYPE_LABELS: Record<string, string> = {
  subscription_act: 'Акт лицензии (АЛ)',
  agent_commission_upd: 'УПД на комиссию (АВ)',
  retail_act: 'Акт услуг розница (АУ)',
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Черновик',
  generated: 'Сформирован',
  sent: 'Отправлен',
  accepted: 'Принят',
  cancelled: 'Отменён',
}

function formatMoney(v: string | number): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ru-RU')
}

function defaultMonthRange(): { from: string; to: string } {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
  return { from, to }
}

async function downloadRetailActArchive(documentId: string, docNumber: string) {
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

export default function AccountingDocumentsTable() {
  const initialRange = useMemo(defaultMonthRange, [])
  const [from, setFrom] = useState(initialRange.from)
  const [to, setTo] = useState(initialRange.to)
  const [docType, setDocType] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')

  const [rows, setRows] = useState<DocRow[]>([])
  const [aggregates, setAggregates] = useState<Aggregates | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [rowBusyId, setRowBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ from, to, limit: '200' })
      if (docType) params.set('docType', docType)
      if (statusFilter) params.set('status', statusFilter)
      const res = await fetch(`/api/superadmin/accounting?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
      setRows(data.documents || [])
      setAggregates(data.aggregates || null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [from, to, docType, statusFilter])

  useEffect(() => {
    load()
  }, [load])

  const handleExport = useCallback(async () => {
    setExporting(true)
    setError(null)
    try {
      const body: any = { from, to }
      if (docType) body.docTypes = [docType]
      const res = await fetch('/api/superadmin/accounting/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const msg = await res.json().catch(() => ({ error: 'Ошибка выгрузки' }))
        throw new Error(msg.error || 'Ошибка выгрузки')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `orbo-docs-${from}_${to}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setExporting(false)
    }
  }, [from, to, docType])

  const handleRowArchive = useCallback(async (row: DocRow) => {
    if (row.doc_type !== 'retail_act') return
    setRowBusyId(row.id)
    setError(null)
    try {
      await downloadRetailActArchive(row.id, row.doc_number)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setRowBusyId(null)
    }
  }, [])

  const handleRowResend = useCallback(
    async (row: DocRow) => {
      const endpoint =
        row.doc_type === 'retail_act'
          ? `/api/superadmin/accounting/retail-act/${row.id}/resend`
          : row.doc_type === 'subscription_act'
            ? `/api/superadmin/accounting/subscription-act/${row.id}/resend`
            : null
      if (!endpoint) return
      setRowBusyId(row.id)
      setError(null)
      try {
        const res = await fetch(endpoint, { method: 'POST' })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Ошибка переотправки')
        await load()
      } catch (e: any) {
        setError(e.message)
      } finally {
        setRowBusyId(null)
      }
    },
    [load]
  )

  return (
    <div className="space-y-4">
      {/* Фильтры */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
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
            <label className="block text-xs font-medium text-gray-600 mb-1">по</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Тип документа</label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">Все типы</option>
              <option value="subscription_act">Акт лицензии (АЛ)</option>
              <option value="agent_commission_upd">УПД комиссии (АВ)</option>
              <option value="retail_act">Акт услуг розница (АУ)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Статус</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">Все статусы</option>
              <option value="generated">Сформирован</option>
              <option value="sent">Отправлен</option>
              <option value="accepted">Принят</option>
              <option value="cancelled">Отменён</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Обновить
            </button>
            <button
              onClick={handleExport}
              disabled={exporting || rows.length === 0}
              className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              title="Выгрузить ZIP с CommerceML XML и реестром"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Выгрузить 1С
            </button>
          </div>
        </div>
      </div>

      {/* Агрегаты */}
      {aggregates && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-600">Всего документов</div>
            <div className="text-2xl font-bold text-gray-900">{aggregates.total_count}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-600">Общая сумма</div>
            <div className="text-2xl font-bold text-gray-900">{formatMoney(aggregates.total_sum)} ₽</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-600">Акты лицензии (АЛ)</div>
            <div className="text-2xl font-bold text-gray-900">{aggregates.subscription_acts_count}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-600">УПД комиссии (АВ)</div>
            <div className="text-2xl font-bold text-gray-900">{aggregates.commission_upds_count}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-600">Акты услуг розница (АУ)</div>
            <div className="text-2xl font-bold text-gray-900">{aggregates.retail_acts_count ?? 0}</div>
          </div>
        </div>
      )}

      {/* Ошибка */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Таблица */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-700">№</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Дата</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Тип</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Период</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Организация</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Контрагент</th>
                <th className="px-4 py-3 text-right font-medium text-gray-700">Сумма, ₽</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Статус</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Эльба</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Файлы</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading && rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-400">
                    <Loader2 className="h-5 w-5 animate-spin inline" /> Загрузка...
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-400">
                    Документы за период не найдены
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const isRetail = r.doc_type === 'retail_act'
                const isSubscriptionAct = r.doc_type === 'subscription_act'
                const isIndividualCustomer = r.customer_type === 'individual'
                // В Эльбу отправляются акты, у которых есть контрагент: ретейл (сводный ФЛ)
                // и субскрипшн для юрлиц/ИП. Физлица в subscription_act не отправляются.
                const elbaApplicable =
                  isRetail || (isSubscriptionAct && !isIndividualCustomer)
                const busy = rowBusyId === r.id
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs font-medium">{r.doc_number}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDate(r.doc_date)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-0.5 text-xs rounded bg-purple-50 text-purple-700">
                        {DOC_TYPE_LABELS[r.doc_type] || r.doc_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600">
                      {r.period_start ? `${formatDate(r.period_start)} — ${formatDate(r.period_end)}` : '—'}
                    </td>
                    <td className="px-4 py-3">{r.org_name || (r.org_id ? r.org_id.slice(0, 8) : '—')}</td>
                    <td className="px-4 py-3">
                      <div>{r.customer_name}</div>
                      {r.customer_inn && (
                        <div className="text-xs text-gray-500">ИНН {r.customer_inn}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                      {formatMoney(r.total_amount)}
                    </td>
                    <td className="px-4 py-3 text-xs">{STATUS_LABELS[r.status] || r.status}</td>
                    <td className="px-4 py-3 text-xs">
                      {!elbaApplicable ? (
                        <span className="text-gray-400" title={isSubscriptionAct && isIndividualCustomer ? 'Физлицу акт в Эльбу не отправляется' : undefined}>—</span>
                      ) : r.elba_sync_status === 'synced' ? (
                        <span className="inline-flex items-center gap-1 text-green-700">
                          <CheckCircle2 className="h-3.5 w-3.5" /> В Эльбе
                        </span>
                      ) : r.elba_sync_status === 'failed' ? (
                        <div className="flex flex-col gap-1">
                          <span
                            className="inline-flex items-center gap-1 text-red-700"
                            title={r.elba_error || undefined}
                          >
                            <XCircle className="h-3.5 w-3.5" /> Ошибка
                          </span>
                          <button
                            onClick={() => handleRowResend(r)}
                            disabled={busy}
                            className="text-[11px] text-orange-700 hover:underline disabled:opacity-50"
                            type="button"
                          >
                            {busy ? '...' : 'повторить'}
                          </button>
                        </div>
                      ) : r.elba_sync_status === 'pending' ? (
                        <span className="text-gray-500">ожидает</span>
                      ) : (
                        <button
                          onClick={() => handleRowResend(r)}
                          disabled={busy}
                          className="text-[11px] text-purple-700 hover:underline disabled:opacity-50"
                          type="button"
                          title="Отправить в Эльбу"
                        >
                          {busy ? '...' : 'отправить'}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {r.html_url && (
                          <a
                            href={r.html_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-purple-600 hover:text-purple-800"
                            title="Открыть HTML-версию"
                          >
                            <FileText className="h-4 w-4" />
                          </a>
                        )}
                        {isRetail && (
                          <button
                            onClick={() => handleRowArchive(r)}
                            disabled={busy}
                            className="inline-flex items-center gap-1 text-purple-600 hover:text-purple-800 disabled:opacity-50"
                            title="Скачать архив: акт + реестр"
                            type="button"
                          >
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                          </button>
                        )}
                        {r.elba_url && (
                          <a
                            href={r.elba_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-purple-600 hover:text-purple-800 text-xs"
                            title="Открыть документ в Эльбе"
                          >
                            Эльба↗
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
