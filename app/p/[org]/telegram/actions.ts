'use server'

import { requireOrgAccess } from '@/lib/orgGuard'
import { createTelegramService } from '@/lib/services/telegramService'
import { createAdminServer } from '@/lib/server/supabaseServer'

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
  
  const org = String(formData.get('org'))
  const chatId = Number(formData.get('chatId'))
  
  if (!chatId || isNaN(chatId)) {
    console.error('Invalid chat ID')
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
    console.error('Error adding group manually:', error)
    return 
  }
}

export async function deleteGroup(formData: FormData) {
  'use server'
  
  const org = String(formData.get('org'))
  const groupId = Number(formData.get('groupId'))
  
  if (!groupId || isNaN(groupId)) {
    console.error('Invalid group ID')
    return { error: 'Invalid group ID' }
  }
  
  try {
    const { supabase } = await requireOrgAccess(org)
    const adminSupabase = createAdminServer()
    
    console.log(`Deleting group ${groupId} from organization ${org}`)
    
    // Получаем группу и её tg_chat_id используя admin client
    // Note: telegram_groups не имеет org_id - связь через org_telegram_groups
    const { data: existingGroup, error: fetchError } = await adminSupabase
      .from('telegram_groups')
      .select('id, tg_chat_id')
      .eq('id', groupId)
      .single()
    
    if (fetchError || !existingGroup) {
      console.error('Group not found:', fetchError)
      return { error: 'Group not found' }
    }
    
    const tgChatIdStr = String(existingGroup.tg_chat_id)
    console.log(`Deleting mapping for org ${org}, tg_chat_id ${tgChatIdStr}`)
    
    // Удаляем связь из org_telegram_groups используя admin client
    const { error: deleteError } = await adminSupabase
      .from('org_telegram_groups')
      .delete()
      .eq('org_id', org)
      .eq('tg_chat_id', tgChatIdStr)
    
    if (deleteError) {
      console.error('Error deleting org-group link:', deleteError)
      return { error: 'Failed to delete group mapping: ' + deleteError.message }
    }
    
    console.log(`Successfully deleted mapping for group ${groupId} from organization ${org}`)
    
    // Проверяем, используется ли эта группа другими организациями
    const { data: otherLinks, error: checkError } = await adminSupabase
      .from('org_telegram_groups')
      .select('org_id')
      .eq('tg_chat_id', tgChatIdStr)
      .limit(1)
    
    if (checkError) {
      console.error('Error checking other org links:', checkError)
    }
    
    // Note: telegram_groups.org_id column doesn't exist anymore
    // All org relationships are managed through org_telegram_groups table
    
    console.log(`Group ${groupId} removed from organization ${org}`)
    return { success: true }
  } catch (error: any) {
    console.error('Error deleting group:', error)
    return { error: error.message || 'Failed to delete group' }
  }
}

export async function checkStatus(formData: FormData) {
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
      console.log('No groups found')
      return
    }
    
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
        console.error(`Error checking group ${group.tg_chat_id}:`, e)
      }
    }
  } catch (error) {
    console.error('Error checking status:', error)
  }
}

