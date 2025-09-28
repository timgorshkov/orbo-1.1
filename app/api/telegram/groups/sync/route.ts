import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer';
import { TelegramService } from '@/lib/services/telegramService';
import { getOrgTelegramGroups } from '@/lib/server/getOrgTelegramGroups';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { orgId } = body;

    if (!orgId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const supabase = createClientServer();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Используем сервисную роль для обхода RLS политик
    const supabaseService = createAdminServer();
    
    console.log(`Looking for verified Telegram account for user ${user.id} in org ${orgId}`);
    
    // Получаем все верифицированные Telegram аккаунты пользователя (не только для текущей организации)
    const { data: telegramAccounts, error: accountsError } = await supabaseService
      .from('user_telegram_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_verified', true);
      
    if (accountsError) {
      console.error('Error fetching all Telegram accounts:', accountsError);
      return NextResponse.json({ 
        error: 'Error fetching Telegram accounts',
        details: accountsError
      }, { status: 500 });
    }
    
    console.log(`Found ${telegramAccounts?.length || 0} verified Telegram accounts for user ${user.id}`);
    
    if (!telegramAccounts || telegramAccounts.length === 0) {
      console.log('No verified Telegram accounts found');
      return NextResponse.json({ 
        error: 'No verified Telegram accounts found for this user' 
      }, { status: 400 });
    }
    
    // Ищем аккаунт для текущей организации
    const telegramAccount = telegramAccounts.find(account => account.org_id === orgId);
    
    // Выбираем аккаунт для текущей организации или первый доступный
    const activeAccount = telegramAccount || telegramAccounts[0];
    
    console.log(`Using Telegram account: ID ${activeAccount.id}, Telegram User ID: ${activeAccount.telegram_user_id}`);
    

    // Инициализируем основной бот для проверки групп
    const telegramService = new TelegramService('main');
    
    console.log(`Syncing groups for user ${user.id}, Telegram ID: ${activeAccount.telegram_user_id} in org ${orgId}`);

    try {
      // Получаем все чаты, где есть бот
      console.log('Getting all chats where bot is present...');
      const botInfo = await telegramService.getMe();
      
      if (!botInfo.ok) {
        return NextResponse.json({ 
          error: 'Failed to get bot info',
          details: botInfo
        }, { status: 500 });
      }
      
      console.log('Bot info:', botInfo.result);
      
      // Получаем обновления, чтобы найти все группы
      // Удаляем вебхук перед получением обновлений, чтобы избежать ошибки 409
      let updates;
      try {
        updates = await telegramService.getUpdates({ limit: 100, deleteWebhook: true });
        
        if (!updates || !updates.ok) {
          return NextResponse.json({ 
            error: 'Failed to get updates',
            details: updates
          }, { status: 500 });
        }
      } catch (updatesError) {
        console.error('Error getting updates:', updatesError);
        
        // Если не удалось получить обновления, попробуем использовать альтернативный метод
        // Добавим группы напрямую через запрос к базе данных
        console.log('Falling back to direct database query for groups...');
        
        // Используем сервисную роль для запроса к базе данных
        // supabaseService уже определен выше
        
      // Получаем все группы, где бот уже добавлен
      console.log('Falling back to direct database query for groups...');
      
      // Сначала получим группы для конкретной организации
      const { data: orgGroups, error: orgGroupsError } = await supabaseService
        .from('org_telegram_groups')
        .select('tg_chat_id')
        .eq('org_id', orgId);
        
      if (orgGroupsError) {
        console.error(`Error fetching groups for org ${orgId}:`, orgGroupsError);
      } else {
        console.log(`Found ${orgGroups?.length || 0} groups for org ${orgId}`);
        
        if (orgGroups && orgGroups.length > 0) {
          const chatIds = orgGroups.map(group => group.tg_chat_id);
          const { data: mappedGroups } = await supabaseService
            .from('telegram_groups')
            .select('*')
            .in('tg_chat_id', chatIds);
          return NextResponse.json({
            success: true,
            message: `Found ${mappedGroups?.length || 0} existing groups for this organization`,
            groups: mappedGroups || []
          });
        }
      }
      
      // Если для этой организации групп нет, получим все активные группы
      const { data: existingGroups, error: groupsError } = await supabaseService
        .from('telegram_groups')
        .select('*')
        .not('bot_status', 'eq', 'inactive');
          
        if (groupsError) {
          console.error('Error fetching existing groups:', groupsError);
          return NextResponse.json({ 
            error: 'Failed to fetch existing groups',
            details: groupsError
          }, { status: 500 });
        }
        
        // Возвращаем список существующих групп
        return NextResponse.json({
          success: true,
          message: `Found ${existingGroups?.length || 0} existing groups`,
          groups: existingGroups || []
        });
      }
      
      console.log(`Got ${updates.result.length} updates`);
      
      // Извлекаем уникальные группы из обновлений
      const uniqueGroups = new Map();
      
      for (const update of updates.result) {
        const chat = update.message?.chat || 
                     update.edited_message?.chat || 
                     update.channel_post?.chat || 
                     update.edited_channel_post?.chat || 
                     update.my_chat_member?.chat ||
                     update.chat_member?.chat;
                     
        if (chat && (chat.type === 'group' || chat.type === 'supergroup')) {
          if (!uniqueGroups.has(chat.id)) {
            uniqueGroups.set(chat.id, {
              id: chat.id,
              title: chat.title,
              type: chat.type
            });
          }
        }
      }
      
      console.log(`Found ${uniqueGroups.size} unique groups`);
      
      // Используем сервисную роль для сохранения данных
      // supabaseService уже определен выше
      
      // Проверяем каждую группу на права администратора
      const addedGroups = [];
      
      // Используем Array.from для обхода проблемы с итерацией по Map.entries()
      for (const [chatId, chatInfo] of Array.from(uniqueGroups.entries())) {
        console.log(`Checking admin rights for chat ${chatId} (${chatInfo.title})`);
        
        try {
          // Получаем информацию о чате
          const chatDetails = await telegramService.getChat(chatId);
          
          if (!chatDetails.ok) {
            console.error(`Failed to get chat details for ${chatId}:`, chatDetails);
            continue;
          }
          
          // Проверяем админские права пользователя в группе
          const adminInfo = await telegramService.getChatMember(chatId, activeAccount.telegram_user_id);
          
          if (!adminInfo.ok) {
            console.error(`Failed to get admin info for ${chatId}:`, adminInfo);
            continue;
          }
          
          const member = adminInfo.result;
          const isAdmin = member.status === 'administrator' || member.status === 'creator';
          const isOwner = member.status === 'creator';
          
          if (!isAdmin) {
            console.log(`User is not admin in chat ${chatId} (${chatInfo.title}), status: ${member.status}`);
            continue;
          }
          
          console.log(`User is admin in chat ${chatId} (${chatInfo.title}), status: ${member.status}`);
          
          console.log(`Ensuring group ${chatId} (${chatInfo.title}) is registered globally`);

      const { data: existingGroupGlobal, error: existingGroupGlobalError } = await supabaseService
        .from('telegram_groups')
        .select('*')
        .eq('tg_chat_id', chatId)
        .maybeSingle();

      if (existingGroupGlobalError && existingGroupGlobalError.code !== 'PGRST116') {
        console.error('Error fetching canonical group:', existingGroupGlobalError);
      }

      let groupRecord = existingGroupGlobal;

      if (!groupRecord) {
        const { data: newGroup, error: insertError } = await supabaseService
          .from('telegram_groups')
          .insert({
            tg_chat_id: chatId,
            title: chatDetails.result.title,
            invite_link: chatDetails.result.invite_link || null,
            bot_status: 'connected',
            verified_by_user_id: user.id,
            verification_status: 'verified',
            last_verification_at: new Date().toISOString(),
            member_count: chatDetails.result.member_count || 0,
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (insertError) {
          console.error(`Error inserting canonical group ${chatId}:`, insertError);
          continue;
        }

        groupRecord = newGroup;
      } else {
        const updatePatch: Record<string, any> = {
          title: chatDetails.result.title,
          invite_link: chatDetails.result.invite_link || null,
          bot_status: 'connected',
          verified_by_user_id: user.id,
          verification_status: 'verified',
          last_verification_at: new Date().toISOString(),
          member_count: chatDetails.result.member_count || 0
        };

        const { data: updatedGroup, error: updateError } = await supabaseService
          .from('telegram_groups')
          .update(updatePatch)
          .eq('id', groupRecord.id)
          .select()
          .single();

        if (updateError) {
          console.error(`Error updating canonical group ${chatId}:`, updateError);
        } else if (updatedGroup) {
          groupRecord = updatedGroup;
        }
      }

      try {
        await supabaseService
          .from('org_telegram_groups')
          .insert({
            org_id: orgId,
            tg_chat_id: chatId,
            created_by: user.id
          });
      } catch (mappingError: any) {
        if (mappingError?.code === '23505') {
          // already linked
        } else if (mappingError?.code === '42P01') {
          console.warn('Mapping table missing during sync; falling back to legacy org_id update');
        } else {
          console.error('Error creating org mapping:', mappingError);
        }
      }

          const { error: adminError } = await supabaseService
            .from('telegram_group_admins')
            .upsert({
              tg_chat_id: chatId,
              tg_user_id: activeAccount.telegram_user_id,
              user_telegram_account_id: activeAccount.id,
              is_owner: isOwner,
              is_admin: isAdmin,
              can_manage_chat: member.can_manage_chat || false,
              can_delete_messages: member.can_delete_messages || false,
              can_manage_video_chats: member.can_manage_video_chats || false,
              can_restrict_members: member.can_restrict_members || false,
              can_promote_members: member.can_promote_members || false,
              can_change_info: member.can_change_info || false,
              can_invite_users: member.can_invite_users || false,
              can_pin_messages: member.can_pin_messages || false,
              verified_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            }, {
              onConflict: 'tg_chat_id,tg_user_id'
            });
          
          if (adminError) {
            console.error(`Error saving admin info for ${chatId}:`, adminError);
          }
        } catch (chatError) {
          console.error(`Error processing chat ${chatId}:`, chatError);
        }
      }
      
      const orgGroups = await getOrgTelegramGroups(orgId);

      return NextResponse.json({
        success: true,
        message: `Synced ${orgGroups.length} groups for org ${orgId}`,
        groups: orgGroups
      });
    } catch (telegramError: any) {
      console.error('Telegram API error:', telegramError);
      return NextResponse.json({ 
        error: 'Failed to sync groups',
        details: telegramError.message
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Error in sync groups:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
