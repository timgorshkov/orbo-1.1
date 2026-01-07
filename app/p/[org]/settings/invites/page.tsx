import { redirect } from 'next/navigation'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import CollapsibleSidebar from '@/components/navigation/collapsible-sidebar'
import InvitesManager from '@/components/settings/invites-manager'

export default async function InvitesPage({
  params
}: {
  params: Promise<{ org: string }>
}) {
  const { org: orgId } = await params
  const supabase = createAdminServer()

  // Проверяем авторизацию через unified auth
  const user = await getUnifiedUser()

  if (!user) {
    redirect(`/signin?redirect=/p/${orgId}/settings/invites`)
  }

  // Определяем роль
  const { data: membership } = await supabase
    .from('memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', orgId)
    .single()

  const role = membership?.role || 'guest'

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
  const { data: invitesRaw } = await supabase
    .from('organization_invites')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  // Получаем количество использований
  const inviteIds = invitesRaw?.map(i => i.id) || [];
  let usesMap = new Map<string, number>();
  
  if (inviteIds.length > 0) {
    const { data: uses } = await supabase
      .from('organization_invite_uses')
      .select('invite_id')
      .in('invite_id', inviteIds);
    
    for (const use of uses || []) {
      usesMap.set(use.invite_id, (usesMap.get(use.invite_id) || 0) + 1);
    }
  }

  const invites = invitesRaw?.map(invite => ({
    ...invite,
    organization_invite_uses: [{ count: usesMap.get(invite.id) || 0 }]
  })) || [];

  // Получаем Telegram-группы для sidebar через org_telegram_groups
  const { data: orgGroupLinks } = await supabase
    .from('org_telegram_groups')
    .select('tg_chat_id')
    .eq('org_id', orgId)

  let telegramGroups: any[] = [];
  if (orgGroupLinks && orgGroupLinks.length > 0) {
    const chatIds = orgGroupLinks.map(l => l.tg_chat_id);
    const { data: groups } = await supabase
      .from('telegram_groups')
      .select('tg_chat_id, title')
      .in('tg_chat_id', chatIds)
      .order('title');
    telegramGroups = groups || [];
  }

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

