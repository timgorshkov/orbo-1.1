import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createTelegramService } from '@/lib/services/telegramService';
import { createClient } from '@supabase/supabase-js';
import { createCronLogger } from '@/lib/logger';

/**
 * Cron job: Синхронизация прав администраторов из Telegram
 * Запускается каждые 6 часов как страховка (основной способ - webhook)
 * 
 * Vercel Cron: "0 *\/6 * * *" (every 6 hours)
 */
export async function GET(request: NextRequest) {
  const logger = createCronLogger('sync-admin-rights');
  const authHeader = request.headers.get('authorization');
  
  // Проверка Vercel Cron Secret (или любой другой секрет для защиты endpoint)
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  logger.info({}, 'Starting admin rights sync');
  const startTime = Date.now();

  try {
    const adminSupabase = createAdminServer();
    const supabaseService = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Получаем все организации с Telegram группами
    const { data: orgs, error: orgsError } = await adminSupabase
      .from('organizations')
      .select(`
        id,
        name,
        org_telegram_groups!inner (
          tg_chat_id,
          telegram_groups (
            tg_chat_id,
            title
          )
        )
      `);

    if (orgsError) {
      logger.error({ error: orgsError.message }, 'Error fetching organizations');
      return NextResponse.json({ error: 'Failed to fetch organizations' }, { status: 500 });
    }

    logger.info({ orgs_count: orgs?.length || 0 }, 'Found organizations with Telegram groups');

    const results = [];
    const telegramService = createTelegramService('main');

    for (const org of orgs || []) {
      logger.debug({ org_id: org.id, org_name: org.name }, 'Processing org');
      
      // Получаем все группы организации
      const { data: groups, error: groupsError } = await adminSupabase
        .from('org_telegram_groups')
        .select(`
          tg_chat_id,
          telegram_groups (
            tg_chat_id,
            title
          )
        `)
        .eq('org_id', org.id);

      if (groupsError) {
        logger.error({ org_id: org.id, error: groupsError.message }, 'Error fetching groups for org');
        continue;
      }

      let updatedGroups = 0;

      for (const groupBinding of groups || []) {
        const chatId = groupBinding.tg_chat_id;
        const groupTitle = (groupBinding.telegram_groups as any)?.title || chatId;

        try {
          logger.debug({ chat_id: chatId, group_title: groupTitle }, 'Fetching admins for group');
          
          // Получаем всех администраторов группы из Telegram
          const adminsResponse = await telegramService.getChatAdministrators(Number(chatId));

          if (!adminsResponse.ok) {
            logger.warn({ 
              chat_id: chatId, 
              error: adminsResponse.description || 'Unknown error' 
            }, 'Failed to get admins for chat');
            continue;
          }

          const administrators = adminsResponse.result || [];
          logger.debug({ chat_id: chatId, admins_count: administrators.length }, 'Found administrators in group');

          // Деактивируем все существующие записи для этой группы
          await supabaseService
            .from('telegram_group_admins')
            .update({
              is_admin: false,
              is_owner: false,
              verified_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 1000).toISOString()
            })
            .eq('tg_chat_id', chatId);

          // Сохраняем новых админов
          for (const admin of administrators) {
            const user = admin.user;
            if (!user || !user.id) continue;

            // Пропускаем ботов (кроме нашего бота, если нужно отслеживать его статус отдельно)
            if (user.is_bot && user.id !== Number(process.env.TELEGRAM_BOT_ID)) continue;

            const isOwner = admin.status === 'creator';

            await supabaseService
              .from('telegram_group_admins')
              .upsert({
                tg_chat_id: chatId,
                tg_user_id: user.id,
                is_admin: true,
                is_owner: isOwner,
                verified_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 дней
              }, {
                onConflict: 'tg_chat_id,tg_user_id'
              });
          }

          updatedGroups++;
        } catch (groupError: any) {
          const errorMessage = groupError.message || String(groupError);
          
          // Группа была конвертирована в супергруппу - это ожидаемая ситуация
          if (errorMessage.includes('upgraded to a supergroup')) {
            logger.warn({ 
              chat_id: chatId, 
              group_title: groupTitle,
              org_id: org.id,
              event: 'CRON_SUPERGROUP_DETECTED'
            }, '⚠️ [CRON] Group upgraded to supergroup - attempting auto-migration');
            
            // 🔄 Пытаемся автоматически выполнить миграцию
            try {
              // Telegram API getChat возвращает migrated_to_chat_id для конвертированных групп
              const chatInfo = await telegramService.getChat(Number(chatId));
              
              if (chatInfo.ok && chatInfo.result?.migrated_to_chat_id) {
                const newChatId = chatInfo.result.migrated_to_chat_id;
                logger.info({ 
                  old_chat_id: chatId, 
                  new_chat_id: newChatId,
                  group_title: groupTitle,
                  org_id: org.id,
                  event: 'CRON_MIGRATION_NEW_ID_FOUND'
                }, '🔄 [CRON] Found new supergroup chat_id - triggering migration');
                
                // Создаем запись для новой группы, если её нет
                const { data: existingNew } = await supabaseService
                  .from('telegram_groups')
                  .select('id, title, bot_status')
                  .eq('tg_chat_id', String(newChatId))
                  .maybeSingle();
                
                if (!existingNew) {
                  // Получаем данные старой группы
                  const { data: oldGroup } = await supabaseService
                    .from('telegram_groups')
                    .select('title, member_count, invite_link')
                    .eq('tg_chat_id', chatId)
                    .maybeSingle();
                  
                  if (oldGroup) {
                    logger.info({
                      old_chat_id: chatId,
                      new_chat_id: newChatId,
                      group_title: oldGroup.title,
                      member_count: oldGroup.member_count,
                      event: 'CRON_MIGRATION_CREATING_NEW_GROUP'
                    }, '🔄 [CRON] Creating new group record from old data');
                    
                    await supabaseService
                      .from('telegram_groups')
                      .insert({
                        tg_chat_id: String(newChatId),
                        title: oldGroup.title,
                        bot_status: 'connected',
                        member_count: oldGroup.member_count,
                        invite_link: oldGroup.invite_link,
                        migrated_from: chatId,
                        last_sync_at: new Date().toISOString()
                      });
                  } else {
                    logger.warn({
                      old_chat_id: chatId,
                      new_chat_id: newChatId,
                      group_title: groupTitle,
                      event: 'CRON_MIGRATION_OLD_NOT_FOUND'
                    }, '⚠️ [CRON] Old group data not found - creating minimal record');
                  }
                } else {
                  logger.info({
                    old_chat_id: chatId,
                    new_chat_id: newChatId,
                    existing_title: existingNew.title,
                    existing_bot_status: existingNew.bot_status,
                    event: 'CRON_MIGRATION_TARGET_EXISTS'
                  }, '🔄 [CRON] Target group already exists');
                }
                
                // Вызываем функцию миграции
                const { data: migrationResult, error: migrationError } = await supabaseService
                  .rpc('migrate_telegram_chat_id', {
                    old_chat_id: Number(chatId),
                    new_chat_id: newChatId
                  });
                
                if (migrationError) {
                  logger.error({ 
                    old_chat_id: chatId, 
                    new_chat_id: newChatId,
                    group_title: groupTitle,
                    org_id: org.id,
                    error: migrationError.message,
                    error_code: (migrationError as any).code,
                    event: 'CRON_MIGRATION_RPC_ERROR'
                  }, '❌ [CRON] Migration RPC error');
                } else {
                  logger.info({ 
                    old_chat_id: chatId, 
                    new_chat_id: newChatId,
                    group_title: groupTitle,
                    org_id: org.id,
                    result: migrationResult,
                    event: 'CRON_MIGRATION_COMPLETED'
                  }, '✅ [CRON] Migration completed successfully');
                  
                  // Записываем миграцию в лог
                  await supabaseService
                    .from('telegram_chat_migrations')
                    .upsert({
                      old_chat_id: Number(chatId),
                      new_chat_id: newChatId,
                      migration_result: migrationResult
                    }, { onConflict: 'old_chat_id,new_chat_id' });
                }
              } else {
                // Не удалось получить новый chat_id - помечаем для ручной миграции
                logger.warn({ 
                  chat_id: chatId,
                  group_title: groupTitle,
                  org_id: org.id,
                  chat_info_ok: chatInfo.ok,
                  event: 'CRON_MIGRATION_NO_NEW_ID'
                }, '⚠️ [CRON] Could not get new chat_id from Telegram API - marking for migration');
                
                await supabaseService
                  .from('telegram_groups')
                  .update({ 
                    bot_status: 'migration_needed',
                    last_sync_at: new Date().toISOString()
                  })
                  .eq('tg_chat_id', chatId);
              }
            } catch (migrationAttemptError: any) {
              logger.error({ 
                chat_id: chatId,
                group_title: groupTitle,
                org_id: org.id,
                error: migrationAttemptError.message,
                event: 'CRON_MIGRATION_EXCEPTION'
              }, '❌ [CRON] Auto-migration attempt failed');
              
              // Помечаем группу как требующую миграции
              await supabaseService
                .from('telegram_groups')
                .update({ 
                  bot_status: 'migration_needed',
                  last_sync_at: new Date().toISOString()
                })
                .eq('tg_chat_id', chatId);
            }
          } else if (errorMessage.includes('bot was kicked') || errorMessage.includes('was kicked from')) {
            // Бот был удалён из группы - это ожидаемая ситуация
            logger.warn({ 
              chat_id: chatId, 
              group_title: groupTitle,
              org_id: org.id,
              event: 'CRON_BOT_KICKED'
            }, '⚠️ [CRON] Bot was kicked from group - marking as inactive');
            
            // Помечаем группу как неактивную
            await supabaseService
              .from('telegram_groups')
              .update({ 
                bot_status: 'inactive',
                last_sync_at: new Date().toISOString()
              })
              .eq('tg_chat_id', chatId);
          } else if (errorMessage.includes('chat not found')) {
            // Группа была удалена или стала недоступна
            logger.warn({ 
              chat_id: chatId, 
              group_title: groupTitle,
              org_id: org.id,
              event: 'CRON_CHAT_NOT_FOUND'
            }, '⚠️ [CRON] Chat not found - marking as inactive');
            
            await supabaseService
              .from('telegram_groups')
              .update({ 
                bot_status: 'inactive',
                last_sync_at: new Date().toISOString()
              })
              .eq('tg_chat_id', chatId);
          } else {
            logger.error({ chat_id: chatId, error: errorMessage }, 'Error processing group');
          }
        }
      }

      // Синхронизируем memberships для организации
      if (updatedGroups > 0) {
        logger.info({ org_id: org.id, updated_groups: updatedGroups }, 'Syncing memberships for org');
        
        const { data: syncResult, error: syncError } = await supabaseService.rpc(
          'sync_telegram_admins',
          { p_org_id: org.id }
        );

        if (syncError) {
          logger.error({ org_id: org.id, error: syncError.message }, 'Error syncing memberships for org');
        } else {
          logger.info({ org_id: org.id, sync_result: syncResult }, 'Memberships synced for org');
        }
      }

      results.push({
        org_id: org.id,
        org_name: org.name,
        updated_groups: updatedGroups,
        total_groups: groups?.length || 0
      });
    }

    const duration = Date.now() - startTime;
    logger.info({ 
      duration_ms: duration,
      organizations_processed: results.length
    }, 'Admin rights sync completed');

    return NextResponse.json({
      success: true,
      duration_ms: duration,
      organizations_processed: results.length,
      results
    });
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Error in admin rights sync');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

