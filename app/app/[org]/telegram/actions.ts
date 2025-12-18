'use server'

import { requireOrgAccess } from '@/lib/orgGuard'
import { createTelegramService } from '@/lib/services/telegramService'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'

interface TelegramUpdate {
  message?: {
    chat?: {
      id: number;
      type: string;
      title?: string;
    };
  };
}

export async function addGroupManually(formData: FormData) {
  'use server'
  const logger = createServiceLogger('addGroupManually');
  
  const org = String(formData.get('org'))
  const chatId = Number(formData.get('chatId'))
  
  if (!chatId || isNaN(chatId)) {
    logger.error({ org, chat_id: chatId }, 'Invalid chat ID');
    return 
  }
  
  try {
    const { supabase } = await requireOrgAccess(org)
    const telegramService = createTelegramService()
    
    // Проверяем, существует ли группа
    const { data: existingGroup } = await supabase
      .from('telegram_groups')
      .select('id')
      .eq('tg_chat_id', chatId)
      .eq('org_id', org)
      .single()
    
    if (existingGroup) {
      return { success: false, error: 'already_exists' }
    }
    
    // Проверяем доступ к группе
    const chatInfo = await telegramService.getChat(chatId)
    if (!chatInfo?.result) {
      return { success: false, error: 'not_found' }
    }
    
    // Проверяем, является ли бот администратором
    const chatMember = await telegramService.getChatMember(
      chatId,
      Number(process.env.NEXT_PUBLIC_TELEGRAM_BOT_ID || process.env.TELEGRAM_BOT_ID)
    )
    
    const isAdmin = chatMember?.result?.status === 'administrator'
    
    // Добавляем группу
    await supabase
      .from('telegram_groups')
      .insert({
        org_id: org,
        tg_chat_id: chatId,
        title: chatInfo.result.title || `Group ${chatId}`,
        bot_status: isAdmin ? 'connected' : 'pending',
        last_sync_at: new Date().toISOString()
      })
    
    return 
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      org,
      chat_id: chatId
    }, 'Error adding group manually');
    return 
  }
}

export async function deleteGroup(formData: FormData) {
  'use server'
  const logger = createServiceLogger('deleteGroup');
  
  const org = String(formData.get('org'))
  const groupId = Number(formData.get('groupId'))
  
  if (!groupId || isNaN(groupId)) {
    logger.error({ org, group_id: groupId }, 'Invalid group ID');
    return { error: 'Invalid group ID' }
  }
  
  try {
    const { supabase } = await requireOrgAccess(org)
    const adminSupabase = createAdminServer()
    
    logger.info({ org, group_id: groupId }, 'Deleting group from organization');
    
    // Получаем группу и её tg_chat_id используя admin client
    // Note: telegram_groups не имеет org_id - связь через org_telegram_groups
    const { data: existingGroup, error: fetchError } = await adminSupabase
      .from('telegram_groups')
      .select('id, tg_chat_id')
      .eq('id', groupId)
      .single()
    
    if (fetchError || !existingGroup) {
      logger.error({ 
        error: fetchError?.message,
        org,
        group_id: groupId
      }, 'Group not found');
      return { error: 'Group not found' }
    }
    
    const tgChatIdStr = String(existingGroup.tg_chat_id)
    logger.debug({ 
      org,
      group_id: groupId,
      tg_chat_id: tgChatIdStr
    }, 'Deleting mapping for org');
    
    // Удаляем связь из org_telegram_groups используя admin client
    const { error: deleteError } = await adminSupabase
      .from('org_telegram_groups')
      .delete()
      .eq('org_id', org)
      .eq('tg_chat_id', tgChatIdStr)
    
    if (deleteError) {
      logger.error({ 
        error: deleteError.message,
        org,
        tg_chat_id: tgChatIdStr
      }, 'Error deleting org-group link');
      return { error: 'Failed to delete group mapping: ' + deleteError.message }
    }
    
    logger.info({ 
      org,
      group_id: groupId,
      tg_chat_id: tgChatIdStr
    }, 'Successfully deleted mapping');
    
    // Проверяем, используется ли эта группа другими организациями
    const { data: otherLinks, error: checkError } = await adminSupabase
      .from('org_telegram_groups')
      .select('org_id')
      .eq('tg_chat_id', tgChatIdStr)
      .limit(1)
    
    if (checkError) {
      logger.warn({ 
        error: checkError.message,
        tg_chat_id: tgChatIdStr
      }, 'Error checking other org links');
    }
    
    // Note: telegram_groups.org_id column doesn't exist anymore
    // All org relationships are managed through org_telegram_groups table
    
    logger.info({ org, group_id: groupId }, 'Group removed from organization');
    return { success: true }
  } catch (error: any) {
    logger.error({ 
      error: error.message,
      stack: error.stack,
      org,
      group_id: groupId
    }, 'Error deleting group');
    return { error: error.message || 'Failed to delete group' }
  }
}

export async function checkStatus(formData: FormData) {
  const logger = createServiceLogger('checkStatus');
  const org = String(formData.get('org'))
  try {
    const { supabase } = await requireOrgAccess(org)
    const telegramService = createTelegramService()
    
    // Вместо получения обновлений, просто обновим статус существующих групп
    const { data: groups } = await supabase
      .from('telegram_groups')
      .select('id, tg_chat_id, title')
      .eq('org_id', org)
    
    if (!groups || groups.length === 0) {
      logger.debug({ org }, 'No groups found');
      return
    }
    
    logger.debug({ 
      org,
      group_count: groups.length
    }, 'Checking status for groups');
    
    // Обновляем статус каждой группы
    for (const group of groups) {
      try {
        // Запрашиваем информацию о чате
        const chatInfo = await telegramService.getChat(group.tg_chat_id)
        
        if (chatInfo?.result) {
          // Проверяем, является ли бот администратором
          const chatMember = await telegramService.getChatMember(
            group.tg_chat_id, 
            Number(process.env.TELEGRAM_BOT_ID)
          )
          
          const isAdmin = chatMember?.result?.status === 'administrator'
          
          // Обновляем информацию о группе
          await supabase
            .from('telegram_groups')
            .update({
              bot_status: isAdmin ? 'connected' : 'pending',
              title: chatInfo.result.title || group.title,
              last_sync_at: new Date().toISOString()
              // analytics_enabled removed in migration 080 (never read)
            })
            .eq('id', group.id)
        }
      } catch (e) {
        logger.error({ 
          error: e instanceof Error ? e.message : String(e),
          org,
          group_id: group.id,
          tg_chat_id: group.tg_chat_id
        }, 'Error checking group');
      }
    }
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      org
    }, 'Error checking status');
  }
}
