'use client'

import dynamic from 'next/dynamic'

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

export default function SuperadminAccountingPage() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Бухгалтерские документы</h2>
        <p className="text-gray-600 mt-1">
          Акты лицензии на тариф (АЛ) и УПД на агентское вознаграждение (АВ). Выгрузка в 1С / CommerceML.
        </p>
      </div>
      <AccountingDocumentsTable />
    </div>
  )
}
