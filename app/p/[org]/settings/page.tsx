import React from 'react'
import { requireOrgAccess } from '@/lib/orgGuard'
import { notFound, redirect } from 'next/navigation'
import { createAdminServer } from '@/lib/server/supabaseServer'
// Supabase removed — using createAdminServer() for all DB operations
import SettingsTabs, { SettingsTab } from '@/components/settings/settings-tabs'
import OrganizationSettingsForm from '@/components/settings/organization-settings-form'
import OrganizationTeam from '@/components/settings/organization-team'
// InvitesManager moved to /p/[org]/members page
// Digest settings are now in the Notifications tab (notification-rules-content.tsx)
import dynamic from 'next/dynamic'
import PortalSettingsForm from '@/components/settings/portal-settings-form'
import { createServiceLogger } from '@/lib/logger'

// Dynamic import for tags page (it's a client component)
const TagsManagementContent = dynamic(() => import('@/components/settings/tags-management-content'), {
  loading: () => <div className="p-6">Загрузка...</div>
})

// Dynamic import for notifications page (it's a client component)
const NotificationRulesContent = dynamic(() => import('@/components/settings/notification-rules-content'), {
  loading: () => <div className="p-6">Загрузка...</div>
})

// Dynamic import for billing page (it's a client component)
const BillingContent = dynamic(() => import('@/components/settings/billing-content'), {
  loading: () => <div className="p-6">Загрузка...</div>
})

// Dynamic import for payments settings page (it's a client component)
const PaymentsSettingsContent = dynamic(() => import('@/components/settings/payments-settings-content'), {
  loading: () => <div className="p-6">Загрузка...</div>
})

// Dynamic import for finances page (it's a client component)
const FinancesContent = dynamic(() => import('@/components/settings/finances-content'), {
  loading: () => <div className="p-6">Загрузка...</div>
})

// Dynamic import for contract page (it's a client component)
const ContractContent = dynamic(() => import('@/components/settings/contract-content'), {
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
    let tabContent: React.ReactNode = null

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
              allowTelegramAdminRole={organization.allow_telegram_admin_role ?? true}
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

      case 'portal': {
        tabContent = (
          <div className="p-6">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold">Портал пространства</h2>
              <p className="text-gray-600 mt-1">
                Настройте, какие разделы видят участники в меню и на главной странице
              </p>
            </div>
            <PortalSettingsForm
              organizationId={orgId}
              initialSettings={{
                portal_show_events:    organization.portal_show_events    ?? true,
                portal_show_members:   organization.portal_show_members   ?? true,
                portal_show_materials: organization.portal_show_materials ?? false,
                portal_show_apps:      organization.portal_show_apps      ?? false,
                portal_welcome_html:   organization.portal_welcome_html   ?? null,
                portal_cover_url:      organization.portal_cover_url      ?? null,
                public_description:    organization.public_description    ?? null,
                telegram_group_link:   organization.telegram_group_link   ?? null,
                collect_pd_consent:           organization.collect_pd_consent           ?? false,
                collect_announcements_consent: organization.collect_announcements_consent ?? false,
                privacy_policy_html:          organization.privacy_policy_html          ?? null,
              }}
              userRole={membership.role as 'owner' | 'admin'}
            />
          </div>
        )
        break
      }

      case 'payments': {
        tabContent = (
          <div className="p-6">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold">Приём платежей</h2>
              <p className="text-gray-600 mt-1">
                Договор, условия сборов и приём оплат
              </p>
            </div>
            <PaymentsSettingsContent
              orgId={orgId}
              initialDefaultPaymentLink={organization.default_payment_link ?? null}
            />
          </div>
        )
        break
      }

      case 'finances': {
        tabContent = (
          <div className="p-6">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold">Финансы</h2>
              <p className="text-gray-600 mt-1">
                Баланс, транзакции и выводы средств
              </p>
            </div>
            <FinancesContent />
          </div>
        )
        break
      }

      case 'contract': {
        // Вкладка «Договор» объединена с «Приём платежей» — редирект
        redirect(`/p/${orgId}/settings?tab=payments`)
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
    // redirect() и notFound() в Next.js App Router работают через throw —
    // их нужно пробросить, иначе catch их «съедает» и возвращает 404.
    if (error instanceof Error && (error.message === 'NEXT_REDIRECT' || error.message === 'NEXT_NOT_FOUND')) {
      throw error
    }
    if (error instanceof Error && error.message === 'Unauthorized') {
      redirect(`/p/${orgId}/auth`)
    }
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      org_id: orgId || 'unknown'
    }, 'Settings page error');
    return notFound()
  }
}
