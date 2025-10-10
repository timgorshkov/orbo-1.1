import { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'
import CollapsibleSidebar from '@/components/navigation/collapsible-sidebar'

type UserRole = 'owner' | 'admin' | 'member' | 'guest'

export default async function OrgLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ org: string }>
}) {
  const { org: orgId } = await params
  console.log('=== OrgLayout START ===')
  console.log('orgId:', orgId)
  
  const supabase = await createClientServer()

  // Проверяем авторизацию
  const {
    data: { user },
  } = await supabase.auth.getUser()

  console.log('user:', user?.id)

  if (!user) {
    console.log('No user, redirecting to signin')
    redirect('/signin')
  }

  // Используем admin client для проверки организации и membership (обход RLS)
  const adminSupabase = createAdminServer()

  // Получаем информацию об организации
  console.log('Fetching organization...')
  const { data: org, error: orgError } = await adminSupabase
    .from('organizations')
    .select('id, name, logo_url')
    .eq('id', orgId)
    .single()

  console.log('org:', org, 'error:', orgError)

  if (orgError || !org) {
    console.error('Organization not found:', orgError)
    redirect('/orgs')
  }

  // Проверяем членство пользователя через admin client
  console.log('Fetching membership for user:', user.id, 'org:', org.id)
  const { data: membership, error: memberError } = await adminSupabase
    .from('memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', org.id)
    .maybeSingle()

  console.log('membership:', membership, 'error:', memberError)

  // Если нет membership - нет доступа
  if (!membership) {
    console.log('❌ No membership found!')
    console.log('Available memberships check:')
    const { data: allMemberships } = await adminSupabase
      .from('memberships')
      .select('org_id, role')
      .eq('user_id', user.id)
    console.log('User memberships:', allMemberships)
    redirect('/orgs')
  }

  console.log('✅ Membership found, role:', membership.role)

  const role = membership.role as UserRole

  // Получаем Telegram-группы для админов
  let telegramGroups: any[] = []
  if (role === 'owner' || role === 'admin') {
    const { data: groups } = await adminSupabase
      .from('telegram_groups')
      .select('id, tg_chat_id, title, bot_status')
      .eq('org_id', org.id)
      .order('title', { ascending: true })

    telegramGroups = groups || []
  }

  console.log('=== OrgLayout SUCCESS ===')

  return (
    <div className="flex h-screen overflow-hidden">
      <CollapsibleSidebar
        orgId={org.id}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        role={role}
        telegramGroups={telegramGroups}
      />
      <main className="flex-1 overflow-y-auto bg-neutral-50">
        {children}
      </main>
    </div>
  )
}
