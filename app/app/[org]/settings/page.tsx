import { requireOrgAccess } from '@/lib/orgGuard'
import { notFound } from 'next/navigation'
import { createAdminServer } from '@/lib/server/supabaseServer'
import OrganizationSettingsForm from '@/components/settings/organization-settings-form'
import OrganizationTeam from '@/components/settings/organization-team'

export default async function OrganizationSettingsPage({ params }: { params: { org: string } }) {
  try {
    const { supabase, user } = await requireOrgAccess(params.org)
    const adminSupabase = createAdminServer()
    
    // Get user's role
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', params.org)
      .eq('user_id', user.id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return notFound()
    }

    // Get organization details
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', params.org)
      .single()

    if (orgError || !org) {
      return notFound()
    }

    // Get team members using admin client to bypass RLS
    const { data: team, error: teamError } = await adminSupabase
      .from('organization_admins')
      .select('*')
      .eq('org_id', params.org)
      .order('role', { ascending: false })
      .order('created_at', { ascending: true })

    if (teamError) {
      console.error('Error fetching team:', teamError)
    }

    // Get group details for admins
    const teamWithGroups = (team || []).map((member: any) => {
      // View organization_admins уже содержит правильные значения
      // для email_confirmed и has_verified_telegram, не переопределяем их
      
      if (member.role === 'admin' && member.role_source === 'telegram_admin') {
        const groupIds = member.metadata?.telegram_groups || []
        const groupTitles = member.metadata?.telegram_group_titles || []
        
        return {
          ...member,
          admin_groups: groupIds.map((id: number, index: number) => ({
            id,
            title: groupTitles[index] || `Group ${id}`
          }))
        }
      }
      
      return {
        ...member,
        admin_groups: []
      }
    })

    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Настройки пространства</h1>
          <p className="text-neutral-600 mt-1">
            Управление основными настройками и командой
          </p>
        </div>

        <div className="space-y-6">
          {/* Organization Settings */}
          <OrganizationSettingsForm
            organization={org}
            userRole={membership.role as 'owner' | 'admin'}
          />

          {/* Team Management */}
          <OrganizationTeam
            organizationId={params.org}
            initialTeam={teamWithGroups}
            userRole={membership.role as 'owner' | 'admin'}
          />
        </div>
      </div>
    )
  } catch (error) {
    console.error('Settings page error:', error)
    return notFound()
  }
}

