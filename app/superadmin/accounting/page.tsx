'use client'

import { useState } from 'react'
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

const ServiceFeeReportPanel = dynamic(
  () => import('@/components/superadmin/service-fee-report-panel'),
  {
    ssr: false,
    loading: () => (
      <div className="animate-pulse">
        <div className="h-40 bg-gray-100 rounded-xl" />
      </div>
    ),
  }
)

export default function SuperadminAccountingPage() {
  const [refreshKey, setRefreshKey] = useState(0)
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Бухгалтерские документы</h2>
        <p className="text-gray-600 mt-1">
          Акты лицензии на тариф (АЛ), УПД на агентское вознаграждение (АВ) и отчёты
          о розничных продажах (ОРП). Выгрузка в 1С / CommerceML.
        </p>
      </div>
      <ServiceFeeReportPanel onGenerated={() => setRefreshKey((k) => k + 1)} />
      <AccountingDocumentsTable key={refreshKey} />
    </div>
  )
}
