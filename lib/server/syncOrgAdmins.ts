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
 */
export async function checkUserAdminStatus(userId: string, orgId: string): Promise<{
  isAdmin: boolean
  groups: Array<{ id: number; title: string }>
}> {
  try {
    const adminSupabase = createAdminServer()
    
    // Get groups where user is admin
    const { data: adminGroups, error } = await adminSupabase
      .from('user_group_admin_status')
      .select(`
        tg_chat_id,
        telegram_groups!inner(id, title, org_id, tg_chat_id)
      `)
      .eq('user_id', userId)
      .eq('is_admin', true)
      .eq('telegram_groups.org_id', orgId)
    
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

