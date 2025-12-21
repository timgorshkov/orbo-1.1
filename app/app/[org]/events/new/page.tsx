import { redirect } from 'next/navigation'
import { requireOrgAccess } from '@/lib/orgGuard'
import EventForm from '@/components/events/event-form'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

export default async function NewEventPage({ params }: { params: { org: string } }) {
  // Check authentication via unified auth (supports both Supabase and NextAuth)
  const user = await getUnifiedUser()
  if (!user) {
    redirect('/signin')
  }

  // Require admin access
  await requireOrgAccess(params.org, ['owner', 'admin'])

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Создать событие</h1>
      </div>

      <EventForm orgId={params.org} mode="create" />
    </div>
  )
}

