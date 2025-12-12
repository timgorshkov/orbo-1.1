import { ErrorDashboard } from '@/components/superadmin/error-dashboard'

export const dynamic = 'force-dynamic'

export default function SuperadminErrorsPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Мониторинг ошибок</h1>
        <p className="text-neutral-600 mt-2">
          Отслеживание критических ошибок и предупреждений в реальном времени
        </p>
      </div>
      
      <ErrorDashboard />
    </div>
  )
}
