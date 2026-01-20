import { requireOrgAccess } from '@/lib/orgGuard'
import { notFound } from 'next/navigation'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createClient } from '@supabase/supabase-js'
import SettingsTabs, { SettingsTab } from '@/components/settings/settings-tabs'
import OrganizationSettingsForm from '@/components/settings/organization-settings-form'
import OrganizationTeam from '@/components/settings/organization-team'
import DigestSettingsForm from '@/components/settings/digest-settings-form'
// InvitesManager moved to /p/[org]/members page
import dynamic from 'next/dynamic'
import { createServiceLogger } from '@/lib/logger'

// Dynamic import for tags page (it's a client component)
const TagsManagementContent = dynamic(() => import('@/components/settings/tags-management-content'), {
  ssr: false,
  loading: () => <div className="p-6">Загрузка...</div>
})

// Dynamic import for notifications page (it's a client component)
const NotificationRulesContent = dynamic(() => import('@/components/settings/notification-rules-content'), {
  ssr: false,
  loading: () => <div className="p-6">Загрузка...</div>
})

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false
    }
  }
);

export default async function OrganizationSettingsPage({ 
  params,
  searchParams 
}: { 
  params: Promise<{ org: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const logger = createServiceLogger('OrganizationSettingsPage');
  let orgId: string | undefined;
  try {
    const { org } = await params;
    orgId = org;
    const { tab } = await searchParams;
    const activeTab: SettingsTab = (tab as SettingsTab) || 'team'
    
    const { supabase, user } = await requireOrgAccess(orgId)
    const adminSupabase = createAdminServer()
    
    // Get user's role
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return notFound()
    }

    // Get organization details
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single()

    if (orgError || !organization) {
      return notFound()
    }

    // Fetch data based on active tab (lazy loading approach)
    let tabContent = null

    switch (activeTab) {
      case 'team': {
        // Get team members
        const { data: team } = await adminSupabase
          .from('organization_admins')
          .select('*')
          .eq('org_id', orgId)
          .order('role', { ascending: false })
          .order('created_at', { ascending: true })

        const teamWithGroups = (team || []).map((member: any) => {
          // Преобразуем поля из view в формат ожидаемый компонентом
          // View возвращает tg_first_name, tg_username, has_verified_email
          // Компонент ожидает full_name, telegram_username, email_confirmed
          const normalizedMember = {
            ...member,
            full_name: member.tg_first_name || member.full_name,
            telegram_username: member.tg_username || member.telegram_username,
            email_confirmed: member.has_verified_email || member.email_confirmed,
          }
          
          if (normalizedMember.role === 'admin' && normalizedMember.role_source === 'telegram_admin') {
            const groupIds = normalizedMember.metadata?.telegram_groups || []
            const groupTitles = normalizedMember.metadata?.telegram_group_titles || []
            
            return {
              ...normalizedMember,
              admin_groups: groupIds.map((id: number, index: number) => ({
                id,
                title: groupTitles[index] || `Group ${id}`
              }))
            }
          }
          
          return {
            ...normalizedMember,
            admin_groups: []
          }
        })

        tabContent = (
          <div className="p-6">
            <OrganizationTeam
              organizationId={orgId}
              initialTeam={teamWithGroups}
              userRole={membership.role as 'owner' | 'admin'}
            />
          </div>
        )
        break
      }

      case 'general': {
        tabContent = (
          <div className="p-6">
            <OrganizationSettingsForm
              organization={organization}
              userRole={membership.role as 'owner' | 'admin'}
            />
          </div>
        )
        break
      }

      case 'tags': {
        tabContent = (
          <div className="p-6">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold">Теги участников</h2>
              <p className="text-gray-600 mt-1">
                Создавайте и управляйте тегами для CRM участников
              </p>
            </div>
            <TagsManagementContent />
          </div>
        )
        break
      }

      case 'notifications': {
        tabContent = (
          <div className="p-6">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold">Уведомления</h2>
            </div>
            <NotificationRulesContent />
          </div>
        )
        break
      }

      case 'digest': {
        const initialSettings = {
          enabled: organization.digest_enabled ?? true,
          day: organization.digest_day ?? 1,
          time: organization.digest_time ?? '09:00:00',
          lastSentAt: organization.last_digest_sent_at,
        }

        tabContent = (
          <div className="p-6 max-w-4xl">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold">Еженедельный дайджест</h2>
              <p className="text-gray-600 mt-1">
                Настройте автоматическую отправку дайджеста активности сообщества
              </p>
            </div>

            <DigestSettingsForm
              orgId={orgId}
              initialSettings={initialSettings}
            />

            {/* Info block */}
            <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="font-medium text-blue-900 mb-2">Что включает дайджест?</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>📊 Метрики активности (сообщения, участники, реакции)</li>
                <li>🌟 Топ-3 самых активных участников</li>
                <li>⚠️ Зоны внимания (неактивные новички, молчащие участники)</li>
                <li>📅 Ближайшие события</li>
                <li>💡 AI-рекомендации по улучшению вовлечённости</li>
              </ul>
              <p className="text-sm text-blue-700 mt-3">
                <strong>Стоимость генерации:</strong> ~$0.002-0.003 за дайджест (~0.19-0.29 ₽)
              </p>
            </div>

            {/* Bot requirements */}
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h3 className="font-medium text-yellow-900 mb-2">Требования</h3>
              <p className="text-sm text-yellow-800">
                Для получения дайджестов в Telegram необходимо:
              </p>
              <ol className="text-sm text-yellow-800 space-y-1 mt-2 ml-4 list-decimal">
                <li>Запустить бота уведомлений Orbo в Telegram (отправьте /start)</li>
                <li>Связать Telegram аккаунт в вашем профиле Orbo</li>
              </ol>
            </div>
          </div>
        )
        break
      }

      // 'invites' tab moved to /p/[org]/members page
    }

    return (
      <div className="bg-gray-50">
        {/* Page Header */}
        <div className="bg-gray-50 pb-6">
          <div className="px-6 pt-6 pb-4">
            <h1 className="text-2xl font-semibold">Настройки пространства</h1>
          </div>
          
          {/* Tabs */}
          <SettingsTabs activeTab={activeTab} orgId={orgId} />
        </div>

        {/* Tab Content */}
        <div className="mx-auto max-w-7xl px-6 pb-6">
          {tabContent}
        </div>
      </div>
    )
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      org_id: orgId || 'unknown'
    }, 'Settings page error');
    return notFound()
  }
}
