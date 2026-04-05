import { NextResponse } from 'next/server';
// Removed unused Supabase import
import { createAdminServer } from '@/lib/server/supabaseServer';
import { TelegramService } from '@/lib/services/telegramService';
import { getOrgTelegramGroups } from '@/lib/server/getOrgTelegramGroups';
import { logErrorToDatabase } from '@/lib/logErrorToDatabase';
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/logAdminAction';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

export const dynamic = 'force-dynamic';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function POST(request: Request) {
  const logger = createAPILogger(request, { endpoint: 'telegram/groups/sync' });
  
  try {
    const body = await request.json();
    const { orgId } = body;

    if (!orgId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const user = await getUnifiedUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Используем сервисную роль для обхода RLS политик
    const supabaseService = createAdminServer();
    
    logger.debug({ user_id: user.id, org_id: orgId }, 'Looking for verified Telegram account');
    
    // Получаем все верифицированные Telegram аккаунты пользователя (не только для текущей организации)
    const { data: telegramAccounts, error: accountsError } = await supabaseService
      .from('user_telegram_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_verified', true);
      
    if (accountsError) {
      logger.error({ 
        user_id: user.id,
        error: accountsError.message
      }, 'Error fetching Telegram accounts');
      return NextResponse.json({ 
        error: 'Error fetching Telegram accounts',
        details: accountsError
      }, { status: 500 });
    }
    
    logger.debug({ 
      user_id: user.id,
      accounts_count: telegramAccounts?.length || 0
    }, 'Found verified Telegram accounts');
    
    if (!telegramAccounts || telegramAccounts.length === 0) {
      logger.warn({ user_id: user.id }, 'No verified Telegram accounts found');
      return NextResponse.json({ 
        error: 'No verified Telegram accounts found for this user' 
      }, { status: 400 });
    }
    
    // Ищем аккаунт для текущей организации
    const telegramAccount = telegramAccounts.find(account => account.org_id === orgId);
    
    // Выбираем аккаунт для текущей организации или первый доступный
    const activeAccount = telegramAccount || telegramAccounts[0];
    
    logger.debug({ 
      account_id: activeAccount.id,
      telegram_user_id: activeAccount.telegram_user_id,
      org_id: orgId
    }, 'Using Telegram account');

    // Инициализируем основной бот для проверки групп
    const telegramService = new TelegramService('main');
    const tgUserId = activeAccount.telegram_user_id;
    
    logger.info({ 
      user_id: user.id, 
      user_email: user.email,
      telegram_user_id: tgUserId, 
      org_id: orgId,
      account_org_id: activeAccount.org_id,
      using_cross_org_account: activeAccount.org_id !== orgId
    }, 'Starting Telegram groups sync');

    try {
      // НОВАЯ ЛОГИКА: Получаем ВСЕ группы из БД, где бот подключен
      // Вместо getUpdates (который ломает webhook) - ищем в telegram_groups
      const { data: allGroups, error: groupsError } = await supabaseService
        .from('telegram_groups')
        .select('id, tg_chat_id, title, bot_status')
        .in('bot_status', ['connected', 'pending']);
      
      if (groupsError) {
        logger.error({ 
          error: groupsError.message
        }, 'Error fetching groups from DB');
        return NextResponse.json({ 
          error: 'Failed to fetch groups from database',
          details: groupsError
        }, { status: 500 });
      }
      
      logger.debug({ groups_count: allGroups?.length || 0 }, 'Found groups in database');
      
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
      
      for (let i = 0; i < allGroups.length; i++) {
        const group = allGroups[i];
        const chatId = group.tg_chat_id;
        logger.debug({ chat_id: chatId, title: group.title }, 'Checking admin rights');

        // Rate limit: pause between groups to avoid Telegram 429
        if (i > 0) {
          await sleep(350);
        }

        try {
          // Получаем информацию о чате (callApi handles 429 retry internally)
          const chatDetails = await telegramService.getChat(chatId);

          if (!chatDetails.ok) {
            logger.warn({ chat_id: chatId, error_code: chatDetails.error_code }, 'Failed to get chat details');
            continue;
          }

          // Проверяем админские права пользователя в группе
          const adminInfo = await telegramService.getChatMember(chatId, activeAccount.telegram_user_id);

          if (!adminInfo.ok) {
            logger.debug({ chat_id: chatId, error: adminInfo.description }, 'Failed to get admin info (not an admin or bot lacks access)');
            continue;
          }
          
          const member = adminInfo.result;
          const isAdmin = member.status === 'administrator' || member.status === 'creator';
          const isOwner = member.status === 'creator';
          
          if (!isAdmin) {
            logger.debug({ 
              chat_id: chatId,
              title: chatDetails.result.title,
              status: member.status
            }, 'User is not admin');
            continue;
          }
          
          logger.debug({ 
            chat_id: chatId,
            title: chatDetails.result.title,
            status: member.status
          }, 'User is admin');
          
          logger.debug({ chat_id: chatId, title: chatDetails.result.title }, 'Ensuring group is registered globally');

      const { data: existingGroupGlobal, error: existingGroupGlobalError } = await supabaseService
        .from('telegram_groups')
        .select('*')
        .eq('tg_chat_id', chatId)
        .maybeSingle();

      if (existingGroupGlobalError && existingGroupGlobalError.code !== 'PGRST116') {
        logger.error({ 
          chat_id: chatId,
          error: existingGroupGlobalError.message
        }, 'Error fetching canonical group');
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
            logger.info({ 
              title: chatDetails.result.title,
              old_chat_id: oldChatId,
              new_chat_id: chatId
            }, 'Chat migration detected');
            
            // Вызываем функцию миграции
            const { data: migrationResult, error: migrationError } = await supabaseService
              .rpc('migrate_telegram_chat_id', {
                old_chat_id: oldChatId,
                new_chat_id: chatId
              });
            
            if (migrationError) {
              logger.error({ 
                old_chat_id: oldChatId,
                new_chat_id: chatId,
                error: migrationError.message
              }, 'Chat migration error');
            } else {
              logger.info({ 
                old_chat_id: oldChatId,
                new_chat_id: chatId
              }, 'Chat migration success');
              
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
        
        // Если после миграции всё ещё нет записи, создаём новую с использованием upsert
        if (!groupRecord) {
          // 🔄 Используем upsert с onConflict для обработки уникального индекса
          const { data: upsertedGroup, error: upsertError } = await supabaseService
            .from('telegram_groups')
            .upsert({
              tg_chat_id: chatId,
              title: chatDetails.result.title,
              bot_status: 'connected',
              // invite_link removed in migration 071
              member_count: chatDetails.result.member_count || 0,
              last_sync_at: new Date().toISOString()
            }, { 
              onConflict: 'tg_chat_id',
              ignoreDuplicates: false 
            })
            .select()
            .single();

          if (upsertError) {
            // Если upsert не сработал, пробуем select
            if (upsertError.code === '23505') {
              const { data: existingAfterConflict } = await supabaseService
                .from('telegram_groups')
                .select('*')
                .eq('tg_chat_id', chatId)
                .single();
              
              if (existingAfterConflict) {
                groupRecord = existingAfterConflict;
              } else {
                logger.error({ 
                  chat_id: chatId,
                  error: upsertError.message
                }, 'Error upserting group (conflict but not found)');
                continue;
              }
            } else {
              logger.error({ 
                chat_id: chatId,
                error: upsertError.message
              }, 'Error upserting canonical group');
              continue;
            }
          } else {
            groupRecord = upsertedGroup || {
              tg_chat_id: chatId,
              title: chatDetails.result.title,
              bot_status: 'connected',
              member_count: chatDetails.result.member_count || 0
            };
          }
        }
      } else {
        const updatePatch: Record<string, any> = {
          title: chatDetails.result.title,
          bot_status: 'connected',
          // invite_link removed in migration 071
          member_count: chatDetails.result.member_count || 0
        };

        const { error: updateError } = await supabaseService
          .from('telegram_groups')
          .update(updatePatch)
          .eq('id', groupRecord.id);

        if (updateError) {
          logger.error({ 
            chat_id: chatId,
            error: updateError.message
          }, 'Error updating canonical group');
        }
      }

      // ⚠️ ИСПРАВЛЕНО: НЕ добавляем группы автоматически в org_telegram_groups
      // Группы должны добавляться явно через /api/telegram/groups/add-to-org
      // Раньше здесь был автоматический insert, который добавлял ВСЕ группы пользователя
      // во ВСЕ организации, что вызывало баг с "чужими" группами
      
      // Проверяем, привязана ли группа к текущей организации (для логирования)
      const { data: existingMapping } = await supabaseService
        .from('org_telegram_groups')
        .select('org_id')
        .eq('org_id', orgId)
        .eq('tg_chat_id', chatId)
        .maybeSingle();
      
      const isLinkedToCurrentOrg = !!existingMapping;
      
      logger.info({
        chat_id: chatId,
        title: chatDetails.result.title,
        org_id: orgId,
        tg_user_id: activeAccount.telegram_user_id,
        is_admin: isAdmin,
        is_owner: isOwner,
        is_linked_to_org: isLinkedToCurrentOrg,
        action: 'sync_admin_rights_only'
      }, 'Syncing admin rights for group (not auto-adding to org)');

      // Обновляем только права админа (это корректно)
      const { error: adminError } = await supabaseService
            .from('telegram_group_admins')
            .upsert({
              tg_chat_id: chatId,
              tg_user_id: activeAccount.telegram_user_id,
              // user_telegram_account_id removed in migration 071
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
            logger.error({ 
              chat_id: chatId,
              error: adminError.message
            }, 'Error saving admin info');
          }
        } catch (chatError) {
          logger.error({ 
            chat_id: chatId,
            error: chatError instanceof Error ? chatError.message : String(chatError)
          }, 'Error processing chat');
        }
      }
      
      const orgGroups = await getOrgTelegramGroups(orgId);

      // Подсчитываем статистику для логов
      const syncStats = {
        total_groups_checked: allGroups?.length || 0,
        groups_where_user_is_admin: availableGroups.length,
        groups_linked_to_org: orgGroups.length,
        user_id: user.id,
        user_email: user.email,
        org_id: orgId,
        telegram_user_id: tgUserId
      };
      
      logger.info(syncStats, 'Telegram groups sync completed');

      // Log admin action
      await logAdminAction({
        orgId,
        userId: user.id,
        action: AdminActions.SYNC_TELEGRAM_GROUP,
        resourceType: ResourceTypes.TELEGRAM_GROUP,
        metadata: {
          groups_count: orgGroups.length,
          groups: orgGroups.slice(0, 5).map((g: any) => g.title),
          sync_stats: syncStats
        }
      });

      return NextResponse.json({
        success: true,
        message: `Synced admin rights. ${orgGroups.length} groups linked to org.`,
        groups: orgGroups,
        stats: {
          checked: allGroups?.length || 0,
          admin_in: availableGroups.length,
          linked: orgGroups.length
        }
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
