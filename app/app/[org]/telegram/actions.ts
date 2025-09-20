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

export async function deleteGroup(formData: FormData) {
  'use server'
  
  const org = String(formData.get('org'))
  const groupId = Number(formData.get('groupId'))
  
  if (!groupId || isNaN(groupId)) {
    console.error('Invalid group ID')
    return
  }
  
  try {
    const { supabase } = await requireOrgAccess(org)
    
    // Проверяем, существует ли группа и принадлежит ли она организации
    const { data: existingGroup } = await supabase
      .from('telegram_groups')
      .select('id')
      .eq('id', groupId)
      .eq('org_id', org)
      .single()
    
    if (!existingGroup) {
      console.error('Group not found or not belongs to organization')
      return
    }
    
    // Удаляем группу
    await supabase
      .from('telegram_groups')
      .delete()
      .eq('id', groupId)
    
    console.log(`Deleted group ID: ${groupId}`)
    return
  } catch (error) {
    console.error('Error deleting group:', error)
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
    
    // 4. Получаем существующие группы по названию для обнаружения дубликатов
    const { data: existingGroups } = await supabase
      .from('telegram_groups')
      .select('id, tg_chat_id, title, bot_status')
      .eq('org_id', org)
    
    const groupsByTitle = new Map()
    if (existingGroups) {
      existingGroups.forEach((group: any) => {
        if (group.title) {
          if (!groupsByTitle.has(group.title)) {
            groupsByTitle.set(group.title, [])
          }
          groupsByTitle.get(group.title).push(group)
        }
      })
    }
    
    // 5. Для каждой группы из Telegram
    for (const [chatId, chatInfo] of Array.from(uniqueGroups.entries())) {
      const title = chatInfo.title || `Group ${chatId}`
      
      // Проверяем, существует ли уже группа в базе по ID чата
      const { data: existingGroupById } = await supabase
        .from('telegram_groups')
        .select('id, bot_status')
        .eq('tg_chat_id', chatId)
        .eq('org_id', org)
        .maybeSingle()
      
      // Проверяем, существуют ли группы с таким же названием
      const sameNameGroups = groupsByTitle.get(title) || []
      
      // Если группа уже существует по ID - обновим информацию
      if (existingGroupById) {
        // Проверяем, является ли бот администратором
        const chatMember = await telegramService.getChatMember(
          chatId, 
          Number(process.env.TELEGRAM_BOT_ID)
        )
        
        const isAdmin = chatMember?.result?.status === 'administrator'
        
        // Обновляем информацию о группе
        await supabase
          .from('telegram_groups')
          .update({
            bot_status: isAdmin ? 'connected' : 'pending',
            title: title,
            last_sync_at: new Date().toISOString()
          })
          .eq('id', existingGroupById.id)
          
        // Если бот админ, можно получить ссылку-приглашение
        if (isAdmin) {
          const inviteLink = await telegramService.createChatInviteLink(chatId)
          if (inviteLink?.result?.invite_link) {
            await supabase
              .from('telegram_groups')
              .update({
                invite_link: inviteLink.result.invite_link
              })
              .eq('id', existingGroupById.id)
          }
        }
        
        // Если нашлись дубликаты по названию с другим ID, и текущая группа активна, удаляем дубликаты
        if (sameNameGroups.length > 0 && isAdmin) {
          for (const duplicate of sameNameGroups) {
            // Удаляем группы с тем же названием, но другим ID и в статусе 'pending'
            if (duplicate.tg_chat_id !== chatId && duplicate.bot_status === 'pending') {
              await supabase
                .from('telegram_groups')
                .delete()
                .eq('id', duplicate.id)
              console.log(`Deleted duplicate group: ${title} (ID: ${duplicate.tg_chat_id})`)
            }
          }
        }
      } else {
        // Если группа не существует по ID, проверяем есть ли группы с таким же названием
        const existingGroupByName = sameNameGroups[0] // Берем первую группу с таким же названием
        
        // Проверяем, является ли бот администратором
        const chatMember = await telegramService.getChatMember(
          chatId, 
          Number(process.env.TELEGRAM_BOT_ID)
        )
        
        const isAdmin = chatMember?.result?.status === 'administrator'
        
        if (existingGroupByName && existingGroupByName.bot_status === 'pending' && isAdmin) {
          // Если есть группа с таким же названием в статусе 'pending', а новая группа активна,
          // обновляем существующую запись новым ID
          await supabase
            .from('telegram_groups')
            .update({
              tg_chat_id: chatId,
              bot_status: 'connected',
              last_sync_at: new Date().toISOString()
            })
            .eq('id', existingGroupByName.id)
          
          console.log(`Updated group ID: ${title} (${existingGroupByName.tg_chat_id} -> ${chatId})`)
        } else {
          // Создаем новую запись
          await supabase
            .from('telegram_groups')
            .insert({
              org_id: org,
              tg_chat_id: chatId,
              title: title,
              bot_status: isAdmin ? 'connected' : 'pending',
              last_sync_at: new Date().toISOString()
            })
          
          console.log(`Added new group: ${title} (ID: ${chatId})`)
        }
      }
    }
    
    // 6. Обновляем статус групп, которые не были затронуты обновлением
    const { data: remainingGroups } = await supabase
      .from('telegram_groups')
      .select('id, tg_chat_id, title')
      .eq('org_id', org)
    
    if (remainingGroups && remainingGroups.length > 0) {
      for (const group of remainingGroups) {
        try {
          // Проверяем, существует ли еще чат
          const chatInfo = await telegramService.getChat(group.tg_chat_id)
          
          if (chatInfo?.result) {
            // Проверяем, является ли бот администратором
            const chatMember = await telegramService.getChatMember(
              group.tg_chat_id, 
              Number(process.env.TELEGRAM_BOT_ID)
            )
            
            const isAdmin = chatMember?.result?.status === 'administrator'
            
            // Обновляем статус
            await supabase
              .from('telegram_groups')
              .update({
                bot_status: isAdmin ? 'connected' : 'pending',
                title: chatInfo.result.title || group.title,
                last_sync_at: new Date().toISOString()
              })
              .eq('id', group.id)
          } else {
            // Если чат не найден, помечаем как неактивный
            await supabase
              .from('telegram_groups')
              .update({
                bot_status: 'inactive',
                last_sync_at: new Date().toISOString()
              })
              .eq('id', group.id)
          }
        } catch (e) {
          console.error(`Error checking group ${group.tg_chat_id}:`, e)
          // В случае ошибки помечаем как неактивный
          await supabase
            .from('telegram_groups')
            .update({
              bot_status: 'inactive',
              last_sync_at: new Date().toISOString()
            })
            .eq('id', group.id)
        }
      }
    }
    
  } catch (error) {
    console.error('Error checking status:', error)
  }
}
