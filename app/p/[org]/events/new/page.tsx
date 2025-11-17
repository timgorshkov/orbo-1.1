import { redirect } from 'next/navigation'
import { createClientServer } from '@/lib/server/supabaseServer'
import { requireOrgAccess } from '@/lib/orgGuard'
import EventForm from '@/components/events/event-form'

export default async function NewEventPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params
  const supabase = await createClientServer()
  
  // Check authentication and admin rights
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/signin')
  }

  // Require admin access
  await requireOrgAccess(orgId, ['owner', 'admin'])

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Создать событие</h1>
      </div>

      <EventForm orgId={orgId} mode="create" />
    </div>
  )
}

