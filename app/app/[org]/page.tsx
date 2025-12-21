import { redirect } from 'next/navigation'
import { getUserRoleInOrg } from '@/lib/auth/getUserRole'
import { getDefaultRoute } from '@/lib/auth/getDefaultRoute'
import { getUnifiedSession } from '@/lib/auth/unified-auth'

export default async function OrgIndexPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params

  // Проверяем авторизацию через unified auth (Supabase или NextAuth)
  const session = await getUnifiedSession()

  if (!session) {
    redirect(`/signin?redirect=/app/${orgId}`)
  }

  const user = { id: session.user.id, email: session.user.email }

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

