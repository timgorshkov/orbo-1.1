import { AuditLog } from '@/components/superadmin/audit-log'

export const dynamic = 'force-dynamic'

export default function SuperadminAuditLogPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Admin Action Audit Log</h1>
        <p className="text-neutral-600 mt-2">
          Track what admins do in the system - who did what and when
        </p>
      </div>
      
      <AuditLog />
    </div>
  )
}

