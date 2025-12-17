import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer';
import { TelegramService } from '@/lib/services/telegramService';
import { getOrgTelegramGroups } from '@/lib/server/getOrgTelegramGroups';
import { logErrorToDatabase } from '@/lib/logErrorToDatabase';
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/logAdminAction';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { orgId } = body;

    if (!orgId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const supabase = await createClientServer();
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
    const tgUserId = activeAccount.telegram_user_id;
    
    console.log(`[Sync] Starting for user ${user.id}, TG ID: ${tgUserId}, org: ${orgId}`);

    try {
      // НОВАЯ ЛОГИКА: Получаем ВСЕ группы из БД, где бот подключен
      // Вместо getUpdates (который ломает webhook) - ищем в telegram_groups
      const { data: allGroups, error: groupsError } = await supabaseService
        .from('telegram_groups')
        .select('id, tg_chat_id, title, bot_status')
        .in('bot_status', ['connected', 'pending']);
      
      if (groupsError) {
        console.error('[Sync] Error fetching groups from DB:', groupsError);
        return NextResponse.json({ 
          error: 'Failed to fetch groups from database',
          details: groupsError
        }, { status: 500 });
      }
      
      console.log(`[Sync] Found ${allGroups?.length || 0} groups in database with active bot`);
      
      if (!allGroups || allGroups.length === 0) {
        // Нет групп с ботом — возвращаем пустой список
        return NextResponse.json({
          success: true,
          message: 'No groups found. Add bot to a group first.',
          groups: []
        });
      }
      
      // Проверяем права администратора пользователя в каждой группе
      const availableGroups = [];
      
      for (const group of allGroups) {
        const chatId = group.tg_chat_id;
        console.log(`[Sync] Checking admin rights in ${chatId} (${group.title})`);
        
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
            console.log(`User is not admin in chat ${chatId} (${chatDetails.result.title}), status: ${member.status}`);
            continue;
          }
          
          console.log(`User is admin in chat ${chatId} (${chatDetails.result.title}), status: ${member.status}`);
          
          console.log(`Ensuring group ${chatId} (${chatDetails.result.title}) is registered globally`);

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
        // Проверяем, есть ли группа с таким же названием (возможная миграция chat_id)
        const { data: duplicateGroups } = await supabaseService
          .from('telegram_groups')
          .select('*')
          .eq('title', chatDetails.result.title)
          .neq('tg_chat_id', chatId);
        
        // Если есть дубль и новый chatId начинается с -100, возможно это миграция
        if (duplicateGroups && duplicateGroups.length > 0) {
          const oldChatId = duplicateGroups[0].tg_chat_id;
          const newChatIdStr = String(chatId);
          const oldChatIdStr = String(oldChatId);
          
          // Проверяем паттерн миграции: старый ID без -100, новый с -100
          if (newChatIdStr.startsWith('-100') && !oldChatIdStr.startsWith('-100')) {
            console.log(`[Chat Migration Detected] ${chatDetails.result.title}: ${oldChatId} -> ${chatId}`);
            
            // Вызываем функцию миграции
            const { data: migrationResult, error: migrationError } = await supabaseService
              .rpc('migrate_telegram_chat_id', {
                old_chat_id: oldChatId,
                new_chat_id: chatId
              });
            
            if (migrationError) {
              console.error('[Chat Migration] Error:', migrationError);
            } else {
              console.log('[Chat Migration] Success:', migrationResult);
              
              // Сохраняем результат миграции
              await supabaseService
                .from('telegram_chat_migrations')
                .insert({
                  old_chat_id: oldChatId,
                  new_chat_id: chatId,
                  migration_result: migrationResult
                });
              
              // Пробуем получить обновленную запись
              const { data: migratedGroup } = await supabaseService
                .from('telegram_groups')
                .select('*')
                .eq('tg_chat_id', chatId)
                .maybeSingle();
              
              if (migratedGroup) {
                groupRecord = migratedGroup;
              }
            }
          }
        }
        
        // Если после миграции всё ещё нет записи, создаём новую
        if (!groupRecord) {
        const { error: insertError } = await supabaseService
            .from('telegram_groups')
            .insert({
              tg_chat_id: chatId,
              title: chatDetails.result.title,
              invite_link: chatDetails.result.invite_link || null,
              bot_status: 'connected',
            // Legacy verification fields removed in migration 080
            member_count: chatDetails.result.member_count || 0
            })

          if (insertError) {
            console.error(`Error inserting canonical group ${chatId}:`, insertError);
            continue;
          }

        groupRecord = {
          tg_chat_id: chatId,
          title: chatDetails.result.title,
          invite_link: chatDetails.result.invite_link || null,
          bot_status: 'connected',
          member_count: chatDetails.result.member_count || 0
        };
        }
      } else {
        const updatePatch: Record<string, any> = {
          title: chatDetails.result.title,
          invite_link: chatDetails.result.invite_link || null,
          bot_status: 'connected',
          // Legacy verification fields removed in migration 080
          member_count: chatDetails.result.member_count || 0
        };

        const { error: updateError } = await supabaseService
          .from('telegram_groups')
          .update(updatePatch)
          .eq('id', groupRecord.id);

        if (updateError) {
          console.error(`Error updating canonical group ${chatId}:`, updateError);
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

      // Log admin action
      await logAdminAction({
        orgId,
        userId: user.id,
        action: AdminActions.SYNC_TELEGRAM_GROUP,
        resourceType: ResourceTypes.TELEGRAM_GROUP,
        metadata: {
          groups_count: orgGroups.length,
          groups: orgGroups.slice(0, 5).map((g: any) => g.title)
        }
      });

      return NextResponse.json({
        success: true,
        message: `Synced ${orgGroups.length} groups for org ${orgId}`,
        groups: orgGroups
      });
    } catch (telegramError: any) {
      await logErrorToDatabase({
        level: 'error',
        message: `Telegram API error during sync: ${telegramError.message}`,
        errorCode: 'TG_GROUP_SYNC_ERROR',
        context: {
          endpoint: '/api/telegram/groups/sync',
          errorType: telegramError.constructor?.name || typeof telegramError,
          orgId
        },
        stackTrace: telegramError.stack,
        orgId
      });
      return NextResponse.json({ 
        error: 'Failed to sync groups',
        details: telegramError.message
      }, { status: 500 });
    }
  } catch (error: any) {
    await logErrorToDatabase({
      level: 'error',
      message: error.message || 'Unknown error syncing groups',
      errorCode: 'TG_GROUP_SYNC_ERROR',
      context: {
        endpoint: '/api/telegram/groups/sync',
        errorType: error.constructor?.name || typeof error
      },
      stackTrace: error.stack
    });
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
