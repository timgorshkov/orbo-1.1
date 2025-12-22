import { requireSuperadmin } from '@/lib/server/superadminGuard'
import { createAdminServer } from '@/lib/server/supabaseServer'
import OrganizationsTable from '@/components/superadmin/organizations-table'

export default async function SuperadminOrganizationsPage() {
  await requireSuperadmin()
  
  const supabase = createAdminServer()
  
  // Получаем организации с метриками
  const { data: organizations } = await supabase
    .from('organizations')
    .select(`
      id,
      name,
      created_at,
      status,
      archived_at,
      user_telegram_accounts (
        is_verified,
        telegram_username,
        telegram_first_name,
        telegram_last_name
      ),
      org_telegram_groups (
        telegram_groups (
          id,
          bot_status
        )
      ),
      participants (
        id
      ),
      material_pages (
        id
      ),
      events (
        id
      )
    `)
    .order('created_at', { ascending: false })
  
  // Форматируем данные
  const formattedOrgs = (organizations || []).map(org => {
    const verifiedAccount = org.user_telegram_accounts?.find((acc: any) => acc.is_verified)
    
    // Формируем отображаемое имя: username или first_name + last_name
    let telegramDisplayName = null
    if (verifiedAccount) {
      if (verifiedAccount.telegram_username) {
        telegramDisplayName = `@${verifiedAccount.telegram_username}`
      } else {
        const fullName = [verifiedAccount.telegram_first_name, verifiedAccount.telegram_last_name]
          .filter(Boolean)
          .join(' ')
        telegramDisplayName = fullName || 'Верифицирован'
      }
    }
    
    return {
      id: org.id,
      name: org.name,
      created_at: org.created_at,
      status: org.status || 'active',
      archived_at: org.archived_at,
      has_telegram: (org.user_telegram_accounts?.length || 0) > 0,
      telegram_verified: !!verifiedAccount,
      telegram_username: telegramDisplayName,
      groups_count: org.org_telegram_groups?.length || 0,
      groups_with_bot: org.org_telegram_groups?.filter((g: any) => 
        g.telegram_groups?.bot_status === 'connected'
      ).length || 0,
      participants_count: org.participants?.length || 0,
      materials_count: org.material_pages?.length || 0,
      events_count: org.events?.length || 0
    }
  })
  
  // Разделяем на активные и архивные
  const activeOrgs = formattedOrgs.filter(o => o.status === 'active')
  const archivedOrgs = formattedOrgs.filter(o => o.status === 'archived')
  
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Организации</h2>
        <p className="text-gray-600 mt-1">
          Все организации платформы с метриками
        </p>
      </div>
      
      <OrganizationsTable 
        organizations={activeOrgs} 
        archivedOrganizations={archivedOrgs}
      />
    </div>
  )
}

