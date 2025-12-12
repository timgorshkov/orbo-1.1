import { AuditLog } from '@/components/superadmin/audit-log'

export const dynamic = 'force-dynamic'

export default function SuperadminAuditLogPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Журнал действий админов</h1>
        <p className="text-neutral-600 mt-2">
          Отслеживание действий администраторов: кто, что и когда сделал
        </p>
      </div>
      
      <AuditLog />
    </div>
  )
}
