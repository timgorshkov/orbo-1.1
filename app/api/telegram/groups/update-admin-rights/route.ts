import { NextResponse } from 'next/server';
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer';
import { TelegramService } from '@/lib/services/telegramService';
import { createAPILogger } from '@/lib/logger';

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
  const logger = createAPILogger(request, { endpoint: '/api/telegram/groups/update-admin-rights' });
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
    
    logger.info({ user_id: user.id, org_id: orgId }, 'Updating admin rights');
    
    // Используем сервисную роль для обхода RLS политик
    const supabaseService = createAdminServer();
    
    // Получаем все верифицированные Telegram аккаунты пользователя (не только для текущей организации)
    const { data: telegramAccounts, error: accountsError } = await supabaseService
      .from('user_telegram_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_verified', true);
      
    if (accountsError) {
      logger.error({ error: accountsError.message, user_id: user.id }, 'Error fetching Telegram accounts');
      return NextResponse.json({
        error: 'Failed to fetch Telegram accounts',
        details: safeErrorJson(accountsError)
      }, { status: 500 });
    }
    
    if (!telegramAccounts || telegramAccounts.length === 0) {
      logger.info({ user_id: user.id }, 'No verified Telegram accounts found');
      return NextResponse.json({ 
        error: 'No verified Telegram accounts found for this user' 
      }, { status: 400 });
    }
    
    logger.debug({ accounts_count: telegramAccounts.length, user_id: user.id }, 'Found verified Telegram accounts');
    
    // Ищем аккаунт для текущей организации
    const telegramAccount = telegramAccounts.find(account => account.org_id === orgId);
    
    // Если нет аккаунта для текущей организации, используем первый доступный
    if (!telegramAccount) {
      logger.debug({ org_id: orgId }, 'No verified Telegram account found for org, using first available account');
    }
    
    // Выбираем аккаунт для текущей организации или первый доступный
    const activeAccount = telegramAccount || telegramAccounts[0];
    
    logger.debug({ telegram_user_id: activeAccount.telegram_user_id, org_id: activeAccount.org_id }, 'Using Telegram account');
    
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
        logger.warn({}, 'org_telegram_groups table not found while updating admin rights');
      } else {
        logger.error({ error: mappingFetchError.message, org_id: orgId }, 'Error fetching org group mappings');
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
        logger.warn({}, 'org_id column missing on telegram_groups while updating admin rights');
      } else {
        logger.error({ error: directGroupsError.message, org_id: orgId }, 'Error fetching legacy org groups');
        return NextResponse.json({
          error: 'Failed to fetch legacy organization groups',
          details: safeErrorJson(directGroupsError)
        }, { status: 500 });
      }
    }

    // ✅ НОВОЕ: Добавляем ВСЕ группы, где есть активность бота (включая новые группы)
    // Используем activity_events вместо удалённой таблицы telegram_activity_events
    try {
      logger.debug({}, 'Scanning activity_events for new groups');
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
      
      logger.debug({ unique_groups_count: uniqueChatIds.size }, 'Found unique groups in activity events');
      
      // Добавляем в кандидаты
      uniqueChatIds.forEach(chatId => candidateChatIds.add(chatId));
    } catch (activityError) {
      logger.error({ error: activityError instanceof Error ? activityError.message : String(activityError) }, 'Error scanning activity events');
      // Не критично, продолжаем
    }

    // ✅ НОВОЕ: Добавляем ВСЕ группы из telegram_groups где бот подключен или pending
    try {
      logger.debug({}, 'Scanning telegram_groups for groups with connected bot');
      const { data: connectedGroups } = await supabaseService
        .from('telegram_groups')
        .select('tg_chat_id')
        .in('bot_status', ['connected', 'pending']);
      
      connectedGroups?.forEach(record => {
        if (record?.tg_chat_id !== undefined && record?.tg_chat_id !== null) {
          candidateChatIds.add(String(record.tg_chat_id));
        }
      });
      
      logger.debug({ groups_count: connectedGroups?.length || 0 }, 'Found groups with connected bot in telegram_groups');
    } catch (groupsError) {
      logger.error({ error: groupsError instanceof Error ? groupsError.message : String(groupsError) }, 'Error scanning telegram_groups');
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
    logger.info({ chats_count: normalizedChatIds.length }, 'Checking admin rights for chats');

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
        logger.debug({ tg_chat_id: chatId }, 'Fetching all administrators for chat');
        const adminsResponse = await telegramService.getChatAdministrators(chatId);

        if (!adminsResponse?.ok) {
          warnings.push(`Failed to fetch administrators for chat ${chatId}: ${adminsResponse?.description || 'Unknown error'}`);
          continue;
        }

        const administrators = adminsResponse.result || [];
        logger.debug({ tg_chat_id: chatId, admins_count: administrators.length }, 'Found administrators in chat');

        // ✅ Проверяем, является ли НАШ БОТ администратором
        const ourBotId = Number(process.env.TELEGRAM_BOT_ID || '8355772450');
        const botAdmin = administrators.find((admin: any) => admin?.user?.id === ourBotId);
        const botHasAdminRights = botAdmin && (botAdmin.status === 'administrator' || botAdmin.status === 'creator');
        
        logger.debug({ bot_id: ourBotId, tg_chat_id: chatId, has_admin_rights: botHasAdminRights }, 'Bot admin rights check');
        
        // ✅ Обновляем bot_status в telegram_groups
        const newBotStatus = botHasAdminRights ? 'connected' : 'pending';
        await supabaseService
          .from('telegram_groups')
          .update({ bot_status: newBotStatus, last_sync_at: new Date().toISOString() })
          .eq('tg_chat_id', chatId);
        
        logger.debug({ tg_chat_id: chatId, bot_status: newBotStatus }, 'Updated bot_status');

        // ✅ КРИТИЧЕСКИЙ ФИКС: Сначала деактивируем ВСЕХ админов этой группы
        // Это гарантирует, что если кого-то убрали из админов, его права будут отозваны
        logger.debug({ tg_chat_id: chatId }, '[DEACTIVATE] Starting deactivation');
        
        // Сначала проверим, сколько записей существует
        const { data: existingAdmins, error: countError } = await supabaseService
          .from('telegram_group_admins')
          .select('tg_user_id, is_admin')
          .eq('tg_chat_id', chatId);
        
        if (countError) {
          logger.error({ tg_chat_id: chatId, error: countError.message }, '[DEACTIVATE] Error counting admins');
        } else {
          logger.debug({ 
            tg_chat_id: chatId,
            existing_admins_count: existingAdmins?.length || 0,
            existing_admins: existingAdmins?.map(a => ({ tg_user_id: a.tg_user_id, is_admin: a.is_admin }))
          }, '[DEACTIVATE] Found existing admin records');
        }
        
        const { data: deactivatedData, error: deactivateError } = await supabaseService
          .from('telegram_group_admins')
          .update({ 
            is_admin: false, 
            is_owner: false,
            verified_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 1000).toISOString() // Истекает немедленно
          })
          .eq('tg_chat_id', chatId)
          .select('tg_user_id');
        
        if (deactivateError) {
          logger.error({ tg_chat_id: chatId, error: deactivateError.message }, '[DEACTIVATE] ERROR deactivating admins');
          warnings.push(`Could not deactivate old admins for chat ${chatId}: ${deactivateError.message}`);
        } else {
          logger.debug({ 
            tg_chat_id: chatId,
            deactivated_count: deactivatedData?.length || 0,
            deactivated_user_ids: deactivatedData?.map(a => a.tg_user_id)
          }, '[DEACTIVATE] Successfully deactivated admins');
        }

        // Обрабатываем каждого администратора
        for (const admin of administrators) {
          const memberStatus = admin?.status;
          const isAdmin = memberStatus === 'administrator' || memberStatus === 'creator';
          const isOwner = memberStatus === 'creator';
          const userId = admin?.user?.id;
          const isBot = admin?.user?.is_bot;

          if (!userId) {
            logger.warn({ tg_chat_id: chatId }, 'Administrator without user ID, skipping');
            continue;
          }

          // ✅ Пропускаем ботов (включая orbo_community_bot) при сохранении в telegram_group_admins
          if (isBot) {
            logger.debug({ 
              tg_chat_id: chatId,
              bot_id: userId,
              bot_username: admin.user?.username || admin.user?.first_name
            }, 'Skipping bot');
            continue;
          }

          const upsertPayload: Record<string, any> = {
            tg_chat_id: chatId,
            tg_user_id: userId,
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

          logger.debug({ 
            tg_chat_id: chatId,
            tg_user_id: userId,
            username: admin.user?.username || admin.user?.first_name
          }, 'Saved admin');
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
    logger.debug({ org_id: orgId }, 'Calling sync_telegram_admins to create memberships');
    try {
      const { error: syncError } = await supabaseService.rpc('sync_telegram_admins', {
        p_org_id: orgId
      });
      
      if (syncError) {
        logger.error({ error: syncError.message, org_id: orgId }, 'Error syncing telegram admins');
        warnings.push(`Failed to sync memberships: ${syncError.message}`);
      } else {
        logger.info({ org_id: orgId }, 'Successfully synced telegram admins to memberships');
      }
    } catch (syncErr: any) {
      logger.error({ 
        error: syncErr.message || String(syncErr),
        stack: syncErr.stack,
        org_id: orgId
      }, 'Error calling sync_telegram_admins');
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
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'Error updating admin rights');
    return NextResponse.json({ 
      error: 'Error updating admin rights',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
