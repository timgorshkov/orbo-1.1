import { redirect } from 'next/navigation'
import { createAdminServer } from '@/lib/server/supabaseServer'
import Link from 'next/link'
import { createServiceLogger } from '@/lib/logger'
import { getUnifiedSession } from '@/lib/auth/unified-auth'
import { LogoutButton } from '@/components/auth/logout-button'
import { isSuperadmin } from '@/lib/server/superadminGuard'
import { OrgsPageTracker } from '@/components/analytics/OrgsPageTracker'

export const dynamic = 'force-dynamic';

const logger = createServiceLogger('OrgsPage');

export default async function OrganizationsPage() {
  try {
    // Проверяем авторизацию через unified auth (Supabase или NextAuth)
    const session = await getUnifiedSession();

    if (!session) {
      logger.debug({}, 'No unified session found, redirecting to signin');
      redirect('/signin');
    }

    const user = {
      id: session.user.id,
      email: session.user.email,
    };
    
    logger.debug({
      user_id: user.id,
      provider: session.provider,
    }, 'User authenticated via unified auth');

  const adminSupabase = createAdminServer();

  // ⚡ ОПТИМИЗАЦИЯ: Выполняем все начальные запросы параллельно
  const [qualificationResult, membershipsResult, telegramAccountsResult, userIsSuperadmin] = await Promise.all([
    // Проверяем квалификацию
    adminSupabase
      .from('user_qualification_responses')
      .select('completed_at')
      .eq('user_id', user.id)
      .single(),
    
    // Получаем все memberships пользователя (только активные организации)
    adminSupabase
      .from('memberships')
      .select(`
        role,
        org_id,
        organizations!inner (
          id,
          name,
          logo_url,
          status
        )
      `)
      .eq('user_id', user.id)
      .or('status.is.null,status.eq.active', { foreignTable: 'organizations' })
      .order('role', { ascending: true }),
    
    // Получаем telegram аккаунты
    adminSupabase
      .from('user_telegram_accounts')
      .select('org_id, telegram_user_id')
      .eq('user_id', user.id),
    
    // Проверяем суперадмина
    isSuperadmin()
  ]);

  const { data: qualification } = qualificationResult;
  const { data: memberships, error: membershipsError } = membershipsResult;
  const { data: telegramAccounts } = telegramAccountsResult;

  // Если квалификация не пройдена — редирект на welcome для прохождения
  if (!qualification?.completed_at) {
    logger.debug({ user_id: user.id }, 'Qualification not completed, redirecting to welcome');
    redirect('/welcome');
  }

  if (membershipsError) {
    logger.error({ 
      user_id: user.id,
      error: membershipsError.message
    }, 'Error fetching memberships');
  }

  let organizations: Array<{
    org_id: string;
    org_name: string;
    logo_url: string | null;
    role: string;
    last_activity_at: string | null;
  }> = memberships?.map(m => {
    const org = Array.isArray(m.organizations) ? m.organizations[0] : m.organizations;
    return {
      org_id: m.org_id,
      org_name: org?.name || 'Без названия',
      logo_url: org?.logo_url || null,
      role: m.role,
      last_activity_at: null // Will be filled later
    };
  }) || []

  // ⚡ ОПТИМИЗАЦИЯ: Обрабатываем telegram аккаунты параллельно вместо цикла с await
  if (telegramAccounts && telegramAccounts.length > 0) {
    // Фильтруем только те, что ещё не в списке организаций
    const missingOrgIds = telegramAccounts
      .filter(ta => !organizations.find(o => o.org_id === ta.org_id))
      .map(ta => ta.org_id);
    
    if (missingOrgIds.length > 0) {
      // Получаем только активные организации одним запросом
      const { data: orgsData } = await adminSupabase
        .from('organizations')
        .select('id, name, logo_url, status')
        .in('id', missingOrgIds)
        .or('status.is.null,status.eq.active');
      
      if (orgsData && orgsData.length > 0) {
        // Проверяем участников одним запросом
        const tgUserIds = telegramAccounts
          .filter(ta => missingOrgIds.includes(ta.org_id))
          .map(ta => ta.telegram_user_id);
        
        const { data: participants } = await adminSupabase
          .from('participants')
          .select('id, org_id, tg_user_id')
          .in('org_id', missingOrgIds)
          .in('tg_user_id', tgUserIds)
          .is('merged_into', null);
        
        // Создаём Set для быстрой проверки
        const participantOrgIds = new Set(participants?.map(p => p.org_id) || []);
        
        // Добавляем организации, где есть participants
        const orgsToAdd = orgsData.filter(org => participantOrgIds.has(org.id));
        
        for (const orgData of orgsToAdd) {
          organizations.push({
            org_id: orgData.id,
            org_name: orgData.name || 'Без названия',
            logo_url: orgData.logo_url || null,
            role: 'member',
            last_activity_at: null // Will be filled later when we fetch activities
          });
        }
        
        // Создаём memberships для всех новых организаций одним запросом
        if (orgsToAdd.length > 0) {
          const membershipsToInsert = orgsToAdd.map(org => ({
            user_id: user.id,
            org_id: org.id,
            role: 'member'
          }));
          
          await adminSupabase
            .from('memberships')
            .upsert(membershipsToInsert, { 
              onConflict: 'user_id,org_id',
              ignoreDuplicates: true 
            });
        }
      }
    }
  }

  // ⚡ Получаем дату последней активности для каждой организации
  if (organizations.length > 0) {
    const orgIds = organizations.map(o => o.org_id);
    
    // Запрос на получение последней активности для каждой организации
    const { data: lastActivities } = await adminSupabase
      .from('activity_events')
      .select('org_id, created_at')
      .in('org_id', orgIds)
      .order('created_at', { ascending: false });
    
    // Создаём map org_id -> last_activity_at (берём первую, т.к. отсортировано desc)
    const activityMap = new Map<string, string>();
    for (const activity of lastActivities || []) {
      if (!activityMap.has(activity.org_id)) {
        activityMap.set(activity.org_id, activity.created_at);
      }
    }
    
    // Заполняем last_activity_at для каждой организации
    organizations = organizations.map(org => ({
      ...org,
      last_activity_at: activityMap.get(org.org_id) || null
    }));
    
    // Сортируем по последней активности (от новых к старым)
    // Организации без активности идут в конец
    organizations.sort((a, b) => {
      if (!a.last_activity_at && !b.last_activity_at) return 0;
      if (!a.last_activity_at) return 1;
      if (!b.last_activity_at) return -1;
      return new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime();
    });
  }

  logger.debug({ 
    user_id: user.id,
    organizations_count: organizations.length
  }, 'User organizations loaded');

  // Если организаций нет - предлагаем создать или выйти
  if (organizations.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        {/* Analytics tracker for empty state */}
        <OrgsPageTracker organizationsCount={0} hasAdminOrgs={false} />
        
        <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
          <h1 className="mb-4 text-2xl font-bold text-gray-900">
            Добро пожаловать!
          </h1>
          <p className="mb-6 text-gray-600">
            У вас пока нет пространств. Создайте своё первое пространство для управления сообществом.
          </p>
          <div className="space-y-3">
            <Link
              href="/orgs/new"
              className="block w-full rounded-lg bg-blue-600 px-4 py-3 text-center font-medium text-white hover:bg-blue-700"
            >
              Создать пространство
            </Link>
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-900">
                <strong>Совет:</strong> После создания пространства вы сможете привязать свой Telegram-аккаунт и добавить группы в настройках.
              </p>
            </div>
          </div>
          {/* Информация о текущем аккаунте и кнопка выхода */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Текущий аккаунт:</p>
                <p className="text-sm text-gray-700">{user.email}</p>
              </div>
              <div className="flex items-center gap-4">
                {userIsSuperadmin && (
                  <Link 
                    href="/superadmin" 
                    className="text-sm text-purple-600 hover:text-purple-700 font-medium"
                  >
                    ⚙️ Суперадминка
                  </Link>
                )}
                <LogoutButton variant="text" showIcon={false} />
              </div>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Чтобы зайти под другим email или зарегистрироваться заново, сначала выйдите из текущего аккаунта.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Разделяем организации на админские и участника
  const adminOrgs = organizations.filter(
    (org) => org.role === 'owner' || org.role === 'admin'
  )
  const memberOrgs = organizations.filter((org) => org.role === 'member')

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'owner':
        return 'Владелец'
      case 'admin':
        return 'Администратор'
      case 'member':
        return 'Участник'
      default:
        return ''
    }
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'owner':
        return 'bg-purple-100 text-purple-800'
      case 'admin':
        return 'bg-blue-100 text-blue-800'
      case 'member':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      {/* Analytics tracker */}
      <OrgsPageTracker 
        organizationsCount={organizations.length} 
        hasAdminOrgs={adminOrgs.length > 0} 
      />
      
      <div className="mx-auto max-w-3xl px-4">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">
          Выберите пространство
        </h1>
        <p className="mb-8 text-gray-600">
          Вы имеете доступ к {organizations.length}{' '}
          {organizations.length === 1
            ? 'пространству'
            : organizations.length < 5
            ? 'пространствам'
            : 'пространствам'}
        </p>

        {/* Админские организации */}
        {adminOrgs.length > 0 && (
          <div className="mb-8">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
              Управление
            </h2>
            <div className="space-y-3">
              {adminOrgs.map((org) => (
                <Link
                  key={org.org_id}
                  href={`/app/${org.org_id}`}
                  className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 transition-all hover:border-blue-300 hover:shadow-md"
                >
                  {org.logo_url ? (
                    <img
                      src={org.logo_url}
                      alt={org.org_name}
                      className="h-14 w-14 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-gray-200 text-xl font-bold text-gray-600">
                      {org.org_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-900">
                      {org.org_name}
                    </h3>
                    <span
                      className={`inline-block mt-1 rounded-full px-2 py-0.5 text-xs font-medium ${getRoleBadgeColor(
                        org.role
                      )}`}
                    >
                      {getRoleLabel(org.role)}
                    </span>
                  </div>
                  <span className="text-gray-400">→</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Организации участника */}
        {memberOrgs.length > 0 && (
          <div>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
              Участие
            </h2>
            <div className="space-y-3">
              {memberOrgs.map((org) => (
                <Link
                  key={org.org_id}
                  href={`/app/${org.org_id}`}
                  className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 transition-all hover:border-gray-300 hover:shadow-sm"
                >
                  {org.logo_url ? (
                    <img
                      src={org.logo_url}
                      alt={org.org_name}
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-200 text-lg font-bold text-gray-600">
                      {org.org_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">
                      {org.org_name}
                    </h3>
                    <span
                      className={`inline-block mt-1 rounded-full px-2 py-0.5 text-xs font-medium ${getRoleBadgeColor(
                        org.role
                      )}`}
                    >
                      {getRoleLabel(org.role)}
                    </span>
                  </div>
                  <span className="text-gray-400">→</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Кнопка создания новой организации */}
        <div className="mt-8">
          <Link
            href="/orgs/new"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <span className="text-lg">+</span>
            <span>Создать новое пространство</span>
          </Link>
        </div>

        {/* Разделитель и кнопка выхода */}
        <div className="mt-12 pt-8 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {user.email}
            </p>
            <div className="flex items-center gap-4">
              {userIsSuperadmin && (
                <Link 
                  href="/superadmin" 
                  className="text-sm text-purple-600 hover:text-purple-700 font-medium"
                >
                  ⚙️ Суперадминка
                </Link>
              )}
              <LogoutButton />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
  } catch (error: any) {
    // NEXT_REDIRECT не является ошибкой - это нормальное поведение Next.js
    if (error?.digest?.startsWith('NEXT_REDIRECT')) {
      throw error;
    }
    
    // Реальная неожиданная ошибка
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'Unexpected error');
    redirect('/signin');
  }
}
