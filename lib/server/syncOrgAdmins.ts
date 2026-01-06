import { createAdminServer } from './supabaseServer'
import { createServiceLogger } from '@/lib/logger'

/**
 * Synchronizes organization admin roles based on Telegram group admin status
 * Should be called when user accesses an organization
 */
export async function syncOrgAdmins(orgId: string): Promise<void> {
  const logger = createServiceLogger('syncOrgAdmins');
  try {
    const adminSupabase = createAdminServer()
    
    // Call the sync function
    const { error } = await adminSupabase.rpc('sync_telegram_admins', {
      p_org_id: orgId
    })
    
    if (error) {
      logger.error({ 
        error: error.message,
        org_id: orgId
      }, 'Error syncing org admins');
      // Don't throw - we don't want to block access if sync fails
    }
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      org_id: orgId
    }, 'Error in syncOrgAdmins');
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
  const logger = createServiceLogger('checkUserAdminStatus');
  try {
    const adminSupabase = createAdminServer()
    
    // First, get all groups in this org
    const { data: orgGroups, error: orgGroupsError } = await adminSupabase
      .from('org_telegram_groups')
      .select('tg_chat_id')
      .eq('org_id', orgId)
    
    if (orgGroupsError) {
      logger.error({ 
        error: orgGroupsError.message,
        user_id: userId,
        org_id: orgId
      }, 'Error fetching org groups');
      return { isAdmin: false, groups: [] }
    }
    
    if (!orgGroups || orgGroups.length === 0) {
      return { isAdmin: false, groups: [] }
    }
    
    const orgChatIds = orgGroups.map(g => g.tg_chat_id)
    
    // Get groups where user is admin AND group is in this org
    const { data: adminStatus, error } = await adminSupabase
      .from('user_group_admin_status')
      .select('tg_chat_id')
      .eq('user_id', userId)
      .eq('is_admin', true)
      .in('tg_chat_id', orgChatIds)
    
    if (error) {
      logger.error({ 
        error: error.message,
        user_id: userId,
        org_id: orgId
      }, 'Error checking admin status');
      return { isAdmin: false, groups: [] }
    }
    
    let groups: Array<{ id: number; title: string }> = [];
    if (adminStatus && adminStatus.length > 0) {
      const chatIds = adminStatus.map((s: any) => s.tg_chat_id);
      const { data: telegramGroups } = await adminSupabase
        .from('telegram_groups')
        .select('id, title, tg_chat_id')
        .in('tg_chat_id', chatIds);
      
      groups = (telegramGroups || []).map((g: any) => ({
        id: Number(g.id),
        title: g.title
      }));
    }
    
    return {
      isAdmin: groups.length > 0,
      groups
    }
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      user_id: userId,
      org_id: orgId
    }, 'Error in checkUserAdminStatus');
    return { isAdmin: false, groups: [] }
  }
}

