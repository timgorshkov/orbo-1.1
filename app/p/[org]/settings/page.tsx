import { requireOrgAccess } from '@/lib/orgGuard'
import { notFound } from 'next/navigation'
import { createAdminServer } from '@/lib/server/supabaseServer'
// Supabase removed — using createAdminServer() for all DB operations
import SettingsTabs, { SettingsTab } from '@/components/settings/settings-tabs'
import OrganizationSettingsForm from '@/components/settings/organization-settings-form'
import OrganizationTeam from '@/components/settings/organization-team'
// InvitesManager moved to /p/[org]/members page
// Digest settings are now in the Notifications tab (notification-rules-content.tsx)
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

// Dynamic import for billing page (it's a client component)
const BillingContent = dynamic(() => import('@/components/settings/billing-content'), {
  ssr: false,
  loading: () => <div className="p-6">Загрузка...</div>
})

const supabaseAdmin = createAdminServer();

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
    
    const { supabase, user, role } = await requireOrgAccess(orgId)
    const adminSupabase = createAdminServer()
    
    // requireOrgAccess now handles superadmin fallback
    if (!['owner', 'admin'].includes(role)) {
      return notFound()
    }
    const membership = { role }

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

      case 'billing': {
        tabContent = (
          <div className="p-6">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold">Тариф и оплата</h2>
              <p className="text-gray-600 mt-1">
                Управляйте тарифом и просматривайте историю платежей
              </p>
            </div>
            <BillingContent />
          </div>
        )
        break
      }

      // 'digest' tab removed - digest settings are now in the Notifications tab
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
