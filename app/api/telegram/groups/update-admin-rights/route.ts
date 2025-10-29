import { NextResponse } from 'next/server';
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer';
import { TelegramService } from '@/lib/services/telegramService';

export const dynamic = 'force-dynamic';

// Функция для безопасной сериализации объектов ошибок
function safeErrorJson(error: any): string {
  try {
    if (!error) return 'No error details';
    
    // Извлекаем только нужные свойства из объекта ошибки
    const errorObj = {
      message: error.message || 'Unknown error',
      name: error.name,
      code: error.code,
      details: error.details
    };
    
    return JSON.stringify(errorObj);
  } catch (e) {
    return 'Error during serialization';
  }
}

export async function POST(request: Request) {
  try {
    // Получаем текущего пользователя
    const supabase = await createClientServer();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Получаем параметры запроса
    const body = await request.json();
    const { orgId } = body;
    
    if (!orgId) {
      return NextResponse.json({ error: 'Missing orgId parameter' }, { status: 400 });
    }
    
    console.log(`Updating admin rights for user ${user.id} in org ${orgId}`);
    
    // Используем сервисную роль для обхода RLS политик
    const supabaseService = createAdminServer();
    
    // Получаем все верифицированные Telegram аккаунты пользователя (не только для текущей организации)
    const { data: telegramAccounts, error: accountsError } = await supabaseService
      .from('user_telegram_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_verified', true);
      
    if (accountsError) {
      console.error('Error fetching Telegram accounts:', safeErrorJson(accountsError));
      return NextResponse.json({
        error: 'Failed to fetch Telegram accounts',
        details: safeErrorJson(accountsError)
      }, { status: 500 });
    }
    
    if (!telegramAccounts || telegramAccounts.length === 0) {
      console.log(`No verified Telegram accounts found for user ${user.id}`);
      return NextResponse.json({ 
        error: 'No verified Telegram accounts found for this user' 
      }, { status: 400 });
    }
    
    console.log(`Found ${telegramAccounts.length} verified Telegram accounts for user ${user.id}`);
    
    // Ищем аккаунт для текущей организации
    const telegramAccount = telegramAccounts.find(account => account.org_id === orgId);
    
    // Если нет аккаунта для текущей организации, используем первый доступный
    if (!telegramAccount) {
      console.log(`No verified Telegram account found for org ${orgId}, using first available account`);
    }
    
    // Выбираем аккаунт для текущей организации или первый доступный
    const activeAccount = telegramAccount || telegramAccounts[0];
    
    console.log(`Using Telegram account: ${activeAccount.telegram_user_id} (from org: ${activeAccount.org_id})`);
    
    // Собираем кандидатов (чаты) только из предусмотренных связей
    const candidateChatIds = new Set<string>();

    const { data: existingAdminRights } = await supabaseService
      .from('telegram_group_admins')
      .select('tg_chat_id')
      .eq('tg_user_id', activeAccount.telegram_user_id);

    existingAdminRights?.forEach(record => {
      if (record?.tg_chat_id !== undefined && record?.tg_chat_id !== null) {
        candidateChatIds.add(String(record.tg_chat_id));
      }
    });

    try {
      const { data: mappingRows, error: mappingError } = await supabaseService
        .from('org_telegram_groups')
        .select('tg_chat_id, status')
        .eq('org_id', orgId);

      if (mappingError) {
        if (mappingError.code === '42703') {
          const { data: fallbackRows } = await supabaseService
            .from('org_telegram_groups')
            .select('tg_chat_id')
            .eq('org_id', orgId);

          fallbackRows?.forEach(row => {
            if (row?.tg_chat_id !== undefined && row?.tg_chat_id !== null) {
              candidateChatIds.add(String(row.tg_chat_id));
            }
          });
        } else {
          throw mappingError;
        }
      } else {
        mappingRows?.forEach(row => {
          if ((row?.status === null || row?.status === undefined || row?.status === 'active') && row?.tg_chat_id !== undefined && row?.tg_chat_id !== null) {
            candidateChatIds.add(String(row.tg_chat_id));
          }
        });
      }
    } catch (mappingFetchError: any) {
      if (mappingFetchError?.code === '42P01') {
        console.warn('org_telegram_groups table not found while updating admin rights');
      } else {
        console.error('Error fetching org group mappings:', safeErrorJson(mappingFetchError));
        return NextResponse.json({
          error: 'Failed to fetch organization mappings',
          details: safeErrorJson(mappingFetchError)
        }, { status: 500 });
      }
    }

    try {
      const { data: directOrgGroups } = await supabaseService
        .from('telegram_groups')
        .select('tg_chat_id')
        .eq('org_id', orgId);

      directOrgGroups?.forEach(group => {
        if (group?.tg_chat_id !== undefined && group?.tg_chat_id !== null) {
          candidateChatIds.add(String(group.tg_chat_id));
        }
      });
    } catch (directGroupsError: any) {
      if (directGroupsError?.code === '42703') {
        console.warn('org_id column missing on telegram_groups while updating admin rights');
      } else {
        console.error('Error fetching legacy org groups:', safeErrorJson(directGroupsError));
        return NextResponse.json({
          error: 'Failed to fetch legacy organization groups',
          details: safeErrorJson(directGroupsError)
        }, { status: 500 });
      }
    }

    // ✅ НОВОЕ: Добавляем ВСЕ группы, где есть активность бота (включая новые группы)
    // Используем activity_events вместо удалённой таблицы telegram_activity_events
    try {
      console.log('Scanning activity_events for new groups...');
      const { data: activityGroups } = await supabaseService
        .from('activity_events')
        .select('tg_chat_id')
        .not('tg_chat_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1000); // Последние 1000 событий
      
      const uniqueChatIds = new Set<string>();
      activityGroups?.forEach(record => {
        if (record?.tg_chat_id !== undefined && record?.tg_chat_id !== null) {
          uniqueChatIds.add(String(record.tg_chat_id));
        }
      });
      
      console.log(`Found ${uniqueChatIds.size} unique groups in activity events`);
      
      // Добавляем в кандидаты
      uniqueChatIds.forEach(chatId => candidateChatIds.add(chatId));
    } catch (activityError) {
      console.error('Error scanning activity events:', activityError);
      // Не критично, продолжаем
    }

    // ✅ НОВОЕ: Добавляем ВСЕ группы из telegram_groups где бот подключен
    try {
      console.log('Scanning telegram_groups for groups with connected bot...');
      const { data: connectedGroups } = await supabaseService
        .from('telegram_groups')
        .select('tg_chat_id')
        .eq('bot_status', 'connected');
      
      connectedGroups?.forEach(record => {
        if (record?.tg_chat_id !== undefined && record?.tg_chat_id !== null) {
          candidateChatIds.add(String(record.tg_chat_id));
        }
      });
      
      console.log(`Found ${connectedGroups?.length || 0} groups with connected bot in telegram_groups`);
    } catch (groupsError) {
      console.error('Error scanning telegram_groups:', groupsError);
      // Не критично, продолжаем
    }

    if (candidateChatIds.size === 0) {
      return NextResponse.json({
        success: true,
        message: 'No candidate groups found for this user',
        updatedGroups: [],
        warnings: []
      });
    }

    const normalizedChatIds = Array.from(candidateChatIds);
    console.log(`Checking admin rights for ${normalizedChatIds.length} chats`);

    const telegramService = new TelegramService('main');
    const updatedGroups: any[] = [];
    const warnings: string[] = [];

    // ✅ Получаем ВСЕХ администраторов для каждой группы
    for (const chatIdStr of normalizedChatIds) {
      const chatId = Number(chatIdStr);

      if (Number.isNaN(chatId)) {
        warnings.push(`Cannot parse chat id ${chatIdStr}, skipping`);
        continue;
      }

      try {
        // Получаем ВСЕХ администраторов группы
        console.log(`Fetching all administrators for chat ${chatId}`);
        const adminsResponse = await telegramService.getChatAdministrators(chatId);

        if (!adminsResponse?.ok) {
          warnings.push(`Failed to fetch administrators for chat ${chatId}: ${adminsResponse?.description || 'Unknown error'}`);
          continue;
        }

        const administrators = adminsResponse.result || [];
        console.log(`Found ${administrators.length} administrators in chat ${chatId}`);

        // Обрабатываем каждого администратора
        for (const admin of administrators) {
          const memberStatus = admin?.status;
          const isAdmin = memberStatus === 'administrator' || memberStatus === 'creator';
          const isOwner = memberStatus === 'creator';
          const userId = admin?.user?.id;
          const isBot = admin?.user?.is_bot;

          if (!userId) {
            console.warn(`Administrator without user ID in chat ${chatId}, skipping`);
            continue;
          }

          // ✅ Пропускаем ботов (включая orbo_community_bot)
          if (isBot) {
            console.log(`⏭️  Skipping bot ${userId} (${admin.user?.username || admin.user?.first_name}) in chat ${chatId}`);
            continue;
          }

          const upsertPayload: Record<string, any> = {
            tg_chat_id: chatId,
            tg_user_id: userId,
            user_telegram_account_id: null, // Будет заполнено через sync_telegram_admins
            is_owner: isOwner,
            is_admin: isAdmin,
            custom_title: admin.custom_title || null,
            verified_at: new Date().toISOString(),
            expires_at: isAdmin
              ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
              : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          };

          const optionalFields = [
            'can_manage_chat',
            'can_delete_messages',
            'can_manage_video_chats',
            'can_restrict_members',
            'can_promote_members',
            'can_change_info',
            'can_invite_users',
            'can_pin_messages',
            'can_post_messages',
            'can_edit_messages'
          ];

          optionalFields.forEach(field => {
            if (Object.prototype.hasOwnProperty.call(admin, field)) {
              upsertPayload[field] = admin[field] ?? false;
            }
          });

          const { error: adminUpsertError } = await supabaseService
            .from('telegram_group_admins')
            .upsert(upsertPayload, { onConflict: 'tg_chat_id,tg_user_id' });

          if (adminUpsertError) {
            warnings.push(`Failed to save admin ${userId} for chat ${chatId}: ${adminUpsertError.message || adminUpsertError.code}`);
            continue;
          }

          console.log(`✅ Saved admin ${userId} (${admin.user?.username || admin.user?.first_name}) for chat ${chatId}`);
        }

        updatedGroups.push({
          tg_chat_id: chatId,
          admins_count: administrators.length
        });
      } catch (groupError: any) {
        warnings.push(`Error processing chat ${chatId}: ${groupError?.message || groupError?.code || 'Unknown error'}`);
      }
    }
    
    // После обновления всех админов, вызываем sync_telegram_admins для создания memberships
    console.log('Calling sync_telegram_admins to create memberships...');
    try {
      const { error: syncError } = await supabaseService.rpc('sync_telegram_admins', {
        p_org_id: orgId
      });
      
      if (syncError) {
        console.error('Error syncing telegram admins:', syncError);
        warnings.push(`Failed to sync memberships: ${syncError.message}`);
      } else {
        console.log('✅ Successfully synced telegram admins to memberships');
      }
    } catch (syncErr: any) {
      console.error('Error calling sync_telegram_admins:', syncErr);
      warnings.push(`Failed to call sync function: ${syncErr.message || 'Unknown error'}`);
    }

    return NextResponse.json({
      success: true,
      message: `Checked admin rights for ${normalizedChatIds.length} chats`,
      updated: updatedGroups.length,
      total: normalizedChatIds.length,
      updatedGroups,
      warnings
    });
  } catch (error: any) {
    console.error('Error updating admin rights:', error instanceof Error ? error.stack : String(error));
    return NextResponse.json({ 
      error: 'Error updating admin rights',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
