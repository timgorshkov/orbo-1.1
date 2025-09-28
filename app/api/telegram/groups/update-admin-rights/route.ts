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
    const supabase = createClientServer();
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

    if (candidateChatIds.size === 0) {
      return NextResponse.json({
        success: true,
        message: 'No candidate groups found for this user',
        updatedGroups: [],
        warnings: []
      });
    }

    const normalizedChatIds = Array.from(candidateChatIds);
    const fetchGroupsBatch = async (ids: string[], includeArchived = false) => {
      if (!ids.length) {
        return { data: [] as any[], error: null };
      }

      try {
        const query = supabaseService
          .from('telegram_groups')
          .select('*')
          .in('tg_chat_id', ids);

        if (!includeArchived) {
          query.eq('is_archived', false);
        }

        const { data, error } = await query;

        if (error) {
          if (error.code === '42703') {
            const { data: fallbackData } = await supabaseService
              .from('telegram_groups')
              .select('*')
              .in('tg_chat_id', ids);

            return {
              data: (fallbackData || []).filter(group => includeArchived || group?.is_archived !== true),
              error: null
            };
          }

          return { data: [] as any[], error };
        }

        return {
          data: (data || []).filter(group => includeArchived || group?.is_archived !== true),
          error: null
        };
      } catch (batchError: any) {
        return { data: [] as any[], error: batchError };
      }
    };

    let { data: targetGroups, error: targetGroupsError } = await fetchGroupsBatch(normalizedChatIds);

    if (targetGroupsError) {
      const fallbackResult = await fetchGroupsBatch(normalizedChatIds, true);
      targetGroups = fallbackResult.data;
      targetGroupsError = fallbackResult.error;
    }

    if (targetGroupsError) {
      return NextResponse.json({
        error: 'Failed to fetch groups',
        details: safeErrorJson(targetGroupsError)
      }, { status: 500 });
    }

    if (!targetGroups || targetGroups.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No accessible groups found for admin rights update',
        updatedGroups: [],
        warnings: []
      });
    }

    const telegramService = new TelegramService('main');
    const updatedGroups: any[] = [];
    const warnings: string[] = [];

    for (const group of targetGroups) {
      const chatIdRaw = group?.tg_chat_id;

      if (chatIdRaw === undefined || chatIdRaw === null) {
        warnings.push('Encountered group without tg_chat_id, skipping');
        continue;
      }

      const chatId = Number(chatIdRaw);

      if (Number.isNaN(chatId)) {
        warnings.push(`Cannot parse chat id ${chatIdRaw} for group ${group?.title || 'Unnamed'}, skipping`);
        continue;
      }

      if (group?.bot_status && !['connected', 'active'].includes(group.bot_status)) {
        warnings.push(`Bot is not admin in chat ${chatIdRaw} (status: ${group.bot_status}), skipping admin check`);
        continue;
      }

      try {
        const adminInfo = await telegramService.getChatMember(chatId, activeAccount.telegram_user_id);

        if (!adminInfo?.ok) {
          warnings.push(`Failed to fetch admin info for chat ${chatIdRaw}: ${adminInfo?.description || 'Unknown error'}`);
          continue;
        }

        const member = adminInfo.result;
        const memberStatus = member?.status;
        const isAdmin = memberStatus === 'administrator' || memberStatus === 'creator';
        const isOwner = memberStatus === 'creator';

        const upsertPayload: Record<string, any> = {
          tg_chat_id: chatIdRaw,
          tg_user_id: activeAccount.telegram_user_id,
          user_telegram_account_id: activeAccount.id,
          is_owner: isOwner,
          is_admin: isAdmin,
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
          'can_pin_messages'
        ];

        optionalFields.forEach(field => {
          if (Object.prototype.hasOwnProperty.call(member, field)) {
            upsertPayload[field] = member[field] ?? false;
          }
        });

        const { error: adminUpsertError } = await supabaseService
          .from('telegram_group_admins')
          .upsert(upsertPayload, { onConflict: 'tg_chat_id,tg_user_id' });

        if (adminUpsertError) {
          warnings.push(`Failed to save admin info for chat ${chatIdRaw}: ${adminUpsertError.message || adminUpsertError.code}`);
          continue;
        }

        updatedGroups.push({
          id: group.id,
          tg_chat_id: chatIdRaw,
          title: group.title,
          is_admin: isAdmin,
          is_owner: isOwner,
          status: memberStatus
        });
      } catch (groupError: any) {
        warnings.push(`Error processing chat ${chatIdRaw}: ${groupError?.message || groupError?.code || 'Unknown error'}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Checked admin rights for ${targetGroups.length} groups`,
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
