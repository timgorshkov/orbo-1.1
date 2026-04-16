'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ContractStatusBadge, CounterpartyTypeBadge } from '@/components/settings/contract-status-badge'

interface ContractRow {
  id: string
  contract_number: string
  contract_date: string
  status: string
  org_name?: string
  counterparty: {
    type: string
    full_name: string | null
    org_name: string | null
  }
}

const STATUS_FILTERS = [
  { value: '', label: 'Все' },
  { value: 'filled_by_client', label: 'Заполнены' },
  { value: 'verified', label: 'Проверены' },
  { value: 'signed', label: 'Заключены' },
  { value: 'terminated', label: 'Расторгнуты' },
]

export default function ContractsTable() {
  const [contracts, setContracts] = useState<ContractRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    fetchContracts()
  }, [statusFilter])

  const fetchContracts = async () => {
    setLoading(true)
    try {
      const params = statusFilter ? `?status=${statusFilter}` : ''
      const res = await fetch(`/api/superadmin/contracts${params}`)
      if (res.ok) {
        const data = await res.json()
        setContracts(data.contracts || [])
      }
    } finally {
      setLoading(false)
    }
  }

  const getCounterpartyName = (c: ContractRow) =>
    c.counterparty.type === 'individual'
      ? c.counterparty.full_name || '—'
      : c.counterparty.org_name || '—'

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {STATUS_FILTERS.slice(1).map(f => {
          const count = contracts.filter(c => f.value === '' || c.status === f.value).length
          const hint =
            f.value === 'verified'
              ? 'Платежи принимаются'
              : f.value === 'signed'
                ? 'Можно выводить деньги'
                : null
          return (
            <div key={f.value} className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-2xl font-bold text-gray-900">
                {f.value === '' ? contracts.length : contracts.filter(c => c.status === f.value).length}
              </div>
              <div className="text-xs text-gray-500">{f.label}</div>
              {hint && <div className="text-[11px] text-gray-400 mt-0.5">{hint}</div>}
            </div>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex gap-1 bg-neutral-100 rounded-lg p-1 w-fit">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              statusFilter === f.value
                ? 'bg-white shadow-sm text-gray-900 font-medium'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-50 border-b">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">№ договора</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Организация</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Контрагент</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Тип</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Статус</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Дата</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Загрузка...</td></tr>
            ) : contracts.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Нет договоров</td></tr>
            ) : contracts.map(c => (
              <tr key={c.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <Link href={`/superadmin/contracts/${c.id}`} className="text-blue-600 hover:underline font-medium">
                    {c.contract_number}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-700">{c.org_name || '—'}</td>
                <td className="px-4 py-3 text-gray-700">{getCounterpartyName(c)}</td>
                <td className="px-4 py-3"><CounterpartyTypeBadge type={c.counterparty.type} /></td>
                <td className="px-4 py-3"><ContractStatusBadge status={c.status} /></td>
                <td className="px-4 py-3 text-gray-500">{new Date(c.contract_date).toLocaleDateString('ru-RU')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
