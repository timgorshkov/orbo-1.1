import { redirect } from 'next/navigation'
import { requireOrgAccess } from '@/lib/orgGuard'
import EventForm from '@/components/events/event-form'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { createAdminServer } from '@/lib/server/supabaseServer'

export default async function NewEventPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params

  // Check authentication via unified auth (supports both Supabase and NextAuth)
  const user = await getUnifiedUser()
  if (!user) {
    redirect('/signin')
  }

  // Require admin access
  await requireOrgAccess(org, ['owner', 'admin'])

  // Load org's default payment link to pre-fill in the event form
  const db = createAdminServer()
  const { data: orgData } = await db
    .from('organizations')
    .select('default_payment_link')
    .eq('id', org)
    .single()

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Создать событие</h1>
      </div>

      <EventForm
        orgId={org}
        mode="create"
        defaultPaymentLink={orgData?.default_payment_link ?? null}
      />
    </div>
  )
}
