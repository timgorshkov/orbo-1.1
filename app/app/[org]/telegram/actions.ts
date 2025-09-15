'use server'

import { requireOrgAccess } from '@/lib/orgGuard'
import { createTelegramService } from '@/lib/services/telegramService'

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

export async function checkStatus(formData: FormData) {
  const org = String(formData.get('org'))
  try {
    const { supabase } = await requireOrgAccess(org)
    const telegramService = createTelegramService()
    
    // 1. Получаем список групп, где бот является участником
    const botUpdates = await telegramService.getUpdates()
    
    if (!botUpdates?.result) {
      console.error('Failed to get bot updates')
      return
    }
    
    // 2. Фильтруем только сообщения из групп
    const groupMessages = botUpdates.result.filter((update: TelegramUpdate) => 
      update.message?.chat?.type === 'group' || 
      update.message?.chat?.type === 'supergroup'
    )
    
    // 3. Получаем уникальные ID групп
    const uniqueGroups = new Map()
    groupMessages.forEach((update: TelegramUpdate) => {
      if (update.message?.chat) {
        uniqueGroups.set(update.message.chat.id, update.message.chat)
      }
    })
    
    // 4. Для каждой группы из Telegram
    for (const [chatId, chatInfo] of Array.from(uniqueGroups.entries())) {
      // Проверяем, существует ли уже группа в базе
      const { data: existingGroup } = await supabase
        .from('telegram_groups')
        .select('id')
        .eq('tg_chat_id', chatId)
        .eq('org_id', org)
        .single()
      
      // Если группа не существует, добавляем её
      if (!existingGroup) {
        // Проверяем, является ли бот администратором
        const chatMember = await telegramService.getChatMember(
          chatId, 
          Number(process.env.TELEGRAM_BOT_ID)
        )
        
        const isAdmin = chatMember?.result?.status === 'administrator'
        
        // Добавляем группу в базу данных
        await supabase
          .from('telegram_groups')
          .insert({
            org_id: org,
            tg_chat_id: chatId,
            title: chatInfo.title || `Group ${chatId}`,
            bot_status: isAdmin ? 'connected' : 'pending',
            last_sync_at: new Date().toISOString()
          })
        
        console.log(`Added new group: ${chatInfo.title || chatId}`)
      }
    }
    
    // 5. Теперь обновляем информацию о всех группах
    const { data: groups } = await supabase
      .from('telegram_groups')
      .select('id, tg_chat_id, title')
      .eq('org_id', org)
    
    if (!groups || groups.length === 0) {
      console.error('No groups found after scan')
      return
    }
    
    // Обновляем статус и информацию о группах
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
            })
            .eq('id', group.id)
            
          // Если бот админ, можно получить ссылку-приглашение
          if (isAdmin) {
            const inviteLink = await telegramService.createChatInviteLink(group.tg_chat_id)
            if (inviteLink?.result?.invite_link) {
              await supabase
                .from('telegram_groups')
                .update({
                  invite_link: inviteLink.result.invite_link
                })
                .eq('id', group.id)
            }
          }
        }
      } catch (e) {
        console.error(`Error checking group ${group.tg_chat_id}:`, e)
      }
    }
    
  } catch (error) {
    console.error('Error checking status:', error)
  }
}
