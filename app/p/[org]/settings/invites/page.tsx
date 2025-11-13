import { redirect } from 'next/navigation'
import { createClientServer } from '@/lib/server/supabaseServer'
import { getUserRoleInOrg } from '@/lib/auth/getUserRole'
import CollapsibleSidebar from '@/components/navigation/collapsible-sidebar'
import InvitesManager from '@/components/settings/invites-manager'

export default async function InvitesPage({
  params
}: {
  params: Promise<{ org: string }>
}) {
  const { org: orgId } = await params
  const supabase = await createClientServer()

  // Проверяем авторизацию
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?redirect=/p/${orgId}/settings/invites`)
  }

  // Определяем роль
  const role = await getUserRoleInOrg(user.id, orgId)

  if (role !== 'owner' && role !== 'admin') {
    redirect(`/p/${orgId}`)
  }

  // Получаем информацию об организации
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, logo_url')
    .eq('id', orgId)
    .single()

  if (!org) {
    redirect('/orgs')
  }

  // Получаем приглашения
  const { data: invites } = await supabase
    .from('organization_invites')
    .select(`
      *,
      organization_invite_uses(count)
    `)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  // Получаем Telegram-группы для sidebar
  const { data: telegramGroups } = await supabase
    .from('telegram_groups')
    .select('tg_chat_id, title')
    .eq('org_id', orgId)
    .order('title')

  return (
    <div className="flex h-screen">
      <CollapsibleSidebar
        orgId={orgId}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        role={role}
        telegramGroups={telegramGroups || []}
      />
      <main className="flex-1 overflow-auto bg-gray-50 p-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">
              Приглашения
            </h1>
            <p className="text-gray-600 mt-1">
              Создавайте ссылки-приглашения для новых участников организации
            </p>
          </div>

          <InvitesManager orgId={orgId} initialInvites={invites || []} />
        </div>
      </main>
    </div>
  )
}

