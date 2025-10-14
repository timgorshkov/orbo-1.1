import { requireOrgAccess } from '@/lib/orgGuard'
import AppShell from '@/components/app-shell'
import { GroupSelectionCard } from '../components/group-selection-card'
import { redirect } from 'next/navigation'
import { createClientServer } from '@/lib/server/supabaseServer'

export default async function SelectGroupsPage({ params }: { params: { org: string } }) {
  // Перенаправляем на корректную страницу с доступными группами
  return redirect(`/app/${params.org}/telegram/available-groups`)
}
