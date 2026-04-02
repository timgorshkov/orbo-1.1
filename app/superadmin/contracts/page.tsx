import { requireSuperadmin } from '@/lib/server/superadminGuard'
import ContractsTable from '@/components/superadmin/contracts-table'

export default async function SuperadminContractsPage() {
  await requireSuperadmin()

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Договоры</h2>
        <p className="text-gray-600 mt-1">Все лицензионные договоры платформы</p>
      </div>
      <ContractsTable />
    </div>
  )
}
