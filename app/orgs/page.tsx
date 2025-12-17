import { redirect } from 'next/navigation'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('OrgsPage');

export default async function OrganizationsPage() {
  try {
    const supabase = await createClientServer()
    const {
      data: { user },
      error
    } = await supabase.auth.getUser()

    // Если есть ошибка auth (невалидный токен и т.д.)
    if (error) {
      // Если токен невалидный - очищаем сессию
      if (error.message?.includes('missing sub claim') || 
          error.message?.includes('invalid claim') ||
          error.status === 403) {
        logger.warn({ error: error.message }, 'Invalid auth token detected, clearing session');
        
        const cookieStore = await cookies();
        const allCookies = cookieStore.getAll();
        allCookies.forEach(cookie => {
          if (cookie.name.includes('supabase') || 
              cookie.name.includes('auth-token') ||
              cookie.name.includes('sb-')) {
            cookieStore.delete(cookie.name);
          }
        });
      } else {
        logger.debug({ error: error.message }, 'Auth error');
      }
      
      redirect('/signin');
    }

    if (!user) {
      redirect('/signin')
    }

  // Используем admin client для получения всех memberships пользователя
  const adminSupabase = createAdminServer()
  
  const { data: memberships, error: membershipsError } = await adminSupabase
    .from('memberships')
    .select(`
      role,
      org_id,
      organizations (
        id,
        name,
        logo_url
      )
    `)
    .eq('user_id', user.id)
    .order('role', { ascending: true })

  if (membershipsError) {
    logger.error({ 
      user_id: user.id,
      error: membershipsError.message
    }, 'Error fetching memberships');
  }

  let organizations = memberships?.map(m => {
    const org = Array.isArray(m.organizations) ? m.organizations[0] : m.organizations;
    return {
      org_id: m.org_id,
      org_name: org?.name || 'Без названия',
      logo_url: org?.logo_url || null,
      role: m.role
    };
  }) || []

  // Дополнительно: находим организации, где пользователь участник через Telegram
  const { data: telegramAccounts } = await adminSupabase
    .from('user_telegram_accounts')
    .select('org_id, telegram_user_id')
    .eq('user_id', user.id)

  if (telegramAccounts && telegramAccounts.length > 0) {
    for (const ta of telegramAccounts) {
      // Проверяем, есть ли уже эта организация в списке
      if (!organizations.find(o => o.org_id === ta.org_id)) {
        // Проверяем, есть ли участник в этой организации
        const { data: participant } = await adminSupabase
          .from('participants')
          .select('id')
          .eq('org_id', ta.org_id)
          .eq('tg_user_id', ta.telegram_user_id)
          .is('merged_into', null)
          .maybeSingle()

        if (participant) {
          // Получаем инфо об организации
          const { data: orgData } = await adminSupabase
            .from('organizations')
            .select('id, name, logo_url')
            .eq('id', ta.org_id)
            .single()

          if (orgData) {
            organizations.push({
              org_id: orgData.id,
              org_name: orgData.name || 'Без названия',
              logo_url: orgData.logo_url || null,
              role: 'member'
            })

            // Автоматически создаём membership для будущих визитов
            await adminSupabase
              .from('memberships')
              .insert({
                user_id: user.id,
                org_id: orgData.id,
                role: 'member'
              })
              // Игнорируем duplicate key error (если membership уже существует)
          }
        }
      }
    }
  }

  logger.debug({ 
    user_id: user.id,
    organizations_count: organizations.length
  }, 'User organizations loaded');

  // Если организаций нет - предлагаем создать
  if (organizations.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
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
