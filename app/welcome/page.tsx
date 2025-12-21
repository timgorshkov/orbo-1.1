import { redirect } from 'next/navigation'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { getUnifiedSession } from '@/lib/auth/unified-auth'
import { WelcomeContent } from './welcome-content'

export default async function WelcomePage() {
  // Проверяем авторизацию через unified auth (Supabase или NextAuth)
  const session = await getUnifiedSession();

  if (!session) {
    redirect('/signin')
  }

  const user = { id: session.user.id, email: session.user.email };

  // Проверяем количество организаций пользователя
  const adminSupabase = createAdminServer()
  const { data: memberships } = await adminSupabase
    .from('memberships')
    .select('org_id')
    .eq('user_id', user.id)

  const orgCount = memberships?.length || 0

  // Если у пользователя уже есть организации, редиректим на список организаций
  if (orgCount > 0) {
    redirect('/orgs')
  }

  // Проверяем, заполнена ли квалификация
  const { data: qualification } = await adminSupabase
    .from('user_qualification_responses')
    .select('completed_at, responses')
    .eq('user_id', user.id)
    .single()

  const qualificationCompleted = !!qualification?.completed_at

  return (
    <WelcomeContent 
      qualificationCompleted={qualificationCompleted}
      initialResponses={qualification?.responses || {}}
    />
  )
}
