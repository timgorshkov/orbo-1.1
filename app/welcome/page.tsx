import { redirect } from 'next/navigation'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { getUnifiedSession } from '@/lib/auth/unified-auth'
import { WelcomeContent } from './welcome-content'

interface WelcomePageProps {
  searchParams: Promise<{ new?: string }>
}

export default async function WelcomePage({ searchParams }: WelcomePageProps) {
  // Проверяем авторизацию через unified auth (Supabase или NextAuth)
  const session = await getUnifiedSession();

  if (!session) {
    redirect('/signin')
  }

  const user = { id: session.user.id, email: session.user.email };

  const adminSupabase = createAdminServer()

  // ⚡ ОПТИМИЗАЦИЯ: Выполняем запросы параллельно
  const [qualificationResult, membershipsResult, userResult] = await Promise.all([
    // Проверяем, заполнена ли квалификация
    adminSupabase
      .from('user_qualification_responses')
      .select('completed_at, responses')
      .eq('user_id', user.id)
      .single(),
    
    // Проверяем количество АКТИВНЫХ организаций пользователя (не archived)
    (async () => {
      const { data: memberships } = await adminSupabase
        .from('memberships')
        .select('org_id')
        .eq('user_id', user.id);
      
      if (!memberships || memberships.length === 0) return { data: [] };
      
      const orgIds = memberships.map(m => m.org_id);
      const { data: activeOrgs } = await adminSupabase
        .from('organizations')
        .select('id')
        .in('id', orgIds)
        .or('status.is.null,status.eq.active');
      
      return { data: activeOrgs?.map(o => ({ org_id: o.id })) || [] };
    })(),
    
    // Получаем данные пользователя для проверки времени создания
    adminSupabase
      .from('users')
      .select('created_at')
      .eq('id', user.id)
      .single()
  ]);

  const { data: qualification } = qualificationResult;
  const { data: memberships } = membershipsResult;
  const { data: userData } = userResult;

  const qualificationCompleted = !!qualification?.completed_at
  // Считаем только активные организации
  const activeOrgCount = memberships?.length || 0

  // Если квалификация пройдена И есть АКТИВНЫЕ организации — редирект на /orgs
  if (qualificationCompleted && activeOrgCount > 0) {
    redirect('/orgs')
  }

  // Определяем, новый ли это пользователь:
  // 1. Проверяем query параметр ?new=1 (устанавливается при email/OAuth регистрации)
  // 2. Резервно: проверяем время создания (менее 5 минут назад)
  const params = await searchParams
  const isNewFromUrl = params.new === '1'
  
  let isNewUser = isNewFromUrl
  
  // Резервная проверка по времени создания (если пользователь создан менее 5 минут назад)
  if (!isNewUser && userData?.created_at) {
    const createdAt = new Date(userData.created_at)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
    isNewUser = createdAt > fiveMinutesAgo
  }

  // Если все организации в архиве (или их нет) — показываем welcome
  // Это позволяет пользователю пройти квалификацию заново или создать новую org
  return (
    <WelcomeContent 
      qualificationCompleted={qualificationCompleted}
      initialResponses={qualification?.responses || {}}
      hasOrganizations={activeOrgCount > 0}
      isNewUser={isNewUser}
    />
  )
}
