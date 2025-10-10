import { redirect } from 'next/navigation'
import { createClientServer } from '@/lib/server/supabaseServer'
import { getUserRoleInOrg } from '@/lib/auth/getUserRole'
import { getDefaultRoute } from '@/lib/auth/getDefaultRoute'

export default async function OrgIndexPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params
  const supabase = await createClientServer()

  // Проверяем авторизацию
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?redirect=/app/${orgId}`)
  }

  // Определяем роль пользователя
  const role = await getUserRoleInOrg(user.id, orgId)

  // Если нет доступа - редирект на список организаций
  if (role === 'guest') {
    redirect('/orgs')
  }

  // Получаем стартовую страницу для роли
  const defaultRoute = await getDefaultRoute(orgId, role)

  // Редиректим на стартовую страницу
  redirect(defaultRoute)
}

