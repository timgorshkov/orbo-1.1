import { createAdminServer } from './supabaseServer'

/**
 * Synchronizes organization admin roles based on Telegram group admin status
 * Should be called when user accesses an organization
 */
export async function syncOrgAdmins(orgId: string): Promise<void> {
  try {
    const adminSupabase = createAdminServer()
    
    // Call the sync function
    const { error } = await adminSupabase.rpc('sync_telegram_admins', {
      p_org_id: orgId
    })
    
    if (error) {
      console.error('Error syncing org admins:', error)
      // Don't throw - we don't want to block access if sync fails
    }
  } catch (error) {
    console.error('Error in syncOrgAdmins:', error)
    // Don't throw - we don't want to block access if sync fails
  }
}

/**
 * Check if user has admin rights in any Telegram group for this org
 * Note: telegram_groups doesn't have org_id - uses org_telegram_groups for org mapping
 */
export async function checkUserAdminStatus(userId: string, orgId: string): Promise<{
  isAdmin: boolean
  groups: Array<{ id: number; title: string }>
}> {
  try {
    const adminSupabase = createAdminServer()
    
    // First, get all groups in this org
    const { data: orgGroups, error: orgGroupsError } = await adminSupabase
      .from('org_telegram_groups')
      .select('tg_chat_id')
      .eq('org_id', orgId)
    
    if (orgGroupsError) {
      console.error('Error fetching org groups:', orgGroupsError)
      return { isAdmin: false, groups: [] }
    }
    
    if (!orgGroups || orgGroups.length === 0) {
      return { isAdmin: false, groups: [] }
    }
    
    const orgChatIds = orgGroups.map(g => g.tg_chat_id)
    
    // Get groups where user is admin AND group is in this org
    const { data: adminGroups, error } = await adminSupabase
      .from('user_group_admin_status')
      .select(`
        tg_chat_id,
        telegram_groups!inner(id, title, tg_chat_id)
      `)
      .eq('user_id', userId)
      .eq('is_admin', true)
      .in('tg_chat_id', orgChatIds)
    
    if (error) {
      console.error('Error checking admin status:', error)
      return { isAdmin: false, groups: [] }
    }
    
    const groups = (adminGroups || []).map((item: any) => ({
      id: item.telegram_groups.id,
      title: item.telegram_groups.title
    }))
    
    return {
      isAdmin: groups.length > 0,
      groups
    }
  } catch (error) {
    console.error('Error in checkUserAdminStatus:', error)
    return { isAdmin: false, groups: [] }
  }
}

