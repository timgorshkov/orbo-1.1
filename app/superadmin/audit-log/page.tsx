import { AuditLog } from '@/components/superadmin/audit-log'

export const dynamic = 'force-dynamic'

export default function SuperadminAuditLogPage() {
  return (
    <div className="container mx-auto py-6 px-4">
      <h1 className="text-xl font-bold mb-4">Журнал действий</h1>
      <AuditLog />
    </div>
  )
}
