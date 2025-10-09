import { redirect } from 'next/navigation'
import AppShell from '@/components/app-shell'
import { createClientServer } from '@/lib/server/supabaseServer'
import { requireOrgAccess } from '@/lib/orgGuard'
import EventForm from '@/components/events/event-form'

export default async function NewEventPage({ params }: { params: { org: string } }) {
  const supabase = await createClientServer()
  
  // Check authentication and admin rights
  const { user } = await supabase.auth.getUser().then(res => res.data)
  if (!user) {
    redirect('/signin')
  }

  // Require admin access
  await requireOrgAccess(params.org, ['owner', 'admin'])

  return (
    <AppShell orgId={params.org} currentPath={`/app/${params.org}/events`} telegramGroups={[]}>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Создать событие</h1>
      </div>

      <EventForm orgId={params.org} mode="create" />
    </AppShell>
  )
}

