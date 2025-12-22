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

  const adminSupabase = createAdminServer()

  // ⚡ ОПТИМИЗАЦИЯ: Выполняем запросы параллельно
  const [qualificationResult, membershipsResult] = await Promise.all([
    // Проверяем, заполнена ли квалификация
    adminSupabase
      .from('user_qualification_responses')
      .select('completed_at, responses')
      .eq('user_id', user.id)
      .single(),
    
    // Проверяем количество АКТИВНЫХ организаций пользователя (не archived)
    adminSupabase
      .from('memberships')
      .select(`
        org_id,
        organizations!inner (
          status
        )
      `)
      .eq('user_id', user.id)
      .or('status.is.null,status.eq.active', { foreignTable: 'organizations' })
  ]);

  const { data: qualification } = qualificationResult;
  const { data: memberships } = membershipsResult;

  const qualificationCompleted = !!qualification?.completed_at
  // Считаем только активные организации
  const activeOrgCount = memberships?.length || 0

  // Если квалификация пройдена И есть АКТИВНЫЕ организации — редирект на /orgs
  if (qualificationCompleted && activeOrgCount > 0) {
    redirect('/orgs')
  }

  // Если все организации в архиве (или их нет) — показываем welcome
  // Это позволяет пользователю пройти квалификацию заново или создать новую org
  return (
    <WelcomeContent 
      qualificationCompleted={qualificationCompleted}
      initialResponses={qualification?.responses || {}}
      hasOrganizations={activeOrgCount > 0}
    />
  )
}
