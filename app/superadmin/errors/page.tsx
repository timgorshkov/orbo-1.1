import { ErrorDashboard } from '@/components/superadmin/error-dashboard'

export const dynamic = 'force-dynamic'

export default function SuperadminErrorsPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Error Dashboard</h1>
        <p className="text-neutral-600 mt-2">
          Monitor and track application errors in real-time
        </p>
      </div>
      
      <ErrorDashboard />
    </div>
  )
}

