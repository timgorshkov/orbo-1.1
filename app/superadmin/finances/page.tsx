import { requireSuperadmin } from '@/lib/server/superadminGuard'
import FinancesDashboard from '@/components/superadmin/finances-dashboard'

export default async function SuperadminFinancesPage() {
  await requireSuperadmin()

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Финансы</h2>
        <p className="text-gray-600 mt-1">Платежи, выводы и финансовая аналитика по платформе</p>
      </div>
      <FinancesDashboard />
    </div>
  )
}
