'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { BookOpen } from 'lucide-react'

const AccountingDocumentsTable = dynamic(
  () => import('@/components/superadmin/accounting-documents-table'),
  {
    ssr: false,
    loading: () => (
      <div className="animate-pulse">
        <div className="h-64 bg-gray-200 rounded-xl" />
      </div>
    ),
  }
)

const RetailActPanel = dynamic(
  () => import('@/components/superadmin/retail-act-panel'),
  {
    ssr: false,
    loading: () => (
      <div className="animate-pulse">
        <div className="h-40 bg-gray-100 rounded-xl" />
      </div>
    ),
  }
)

const InvoicesWithoutActPanel = dynamic(
  () => import('@/components/superadmin/invoices-without-act-panel'),
  { ssr: false, loading: () => null }
)

const IncomeLedgerPanel = dynamic(
  () => import('@/components/superadmin/income-ledger-panel'),
  {
    ssr: false,
    loading: () => (
      <div className="animate-pulse">
        <div className="h-48 bg-gray-100 rounded-xl" />
      </div>
    ),
  }
)

export default function SuperadminAccountingPage() {
  const [refreshKey, setRefreshKey] = useState(0)
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Бухгалтерские документы</h2>
          <p className="text-gray-600 mt-1">
            Акты лицензии на тариф (АЛ), УПД на агентское вознаграждение (АВ) и акты
            об оказании услуг розничным покупателям (АУ). Акты на розничных покупателей
            автоматически отправляются в Контур.Эльбу.
          </p>
        </div>
        <Link
          href="/superadmin/accounting/instruction"
          className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-300 rounded-lg whitespace-nowrap"
        >
          <BookOpen className="w-4 h-4" />
          Инструкция для бухгалтера
        </Link>
      </div>
      <IncomeLedgerPanel />
      <RetailActPanel onGenerated={() => setRefreshKey((k) => k + 1)} />
      <InvoicesWithoutActPanel onRegenerated={() => setRefreshKey((k) => k + 1)} />
      <AccountingDocumentsTable key={refreshKey} />
    </div>
  )
}
