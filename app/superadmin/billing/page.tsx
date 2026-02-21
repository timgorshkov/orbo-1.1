'use client'

import dynamic from 'next/dynamic'

const BillingManagement = dynamic(() => import('@/components/superadmin/billing-management'), {
  ssr: false,
  loading: () => <div className="animate-pulse"><div className="h-64 bg-gray-200 rounded-xl" /></div>,
})

export default function SuperadminBillingPage() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Биллинг и подписки</h2>
        <p className="text-gray-600 mt-1">
          Управление тарифами организаций, активация подписок и история платежей
        </p>
      </div>
      <BillingManagement />
    </div>
  )
}
