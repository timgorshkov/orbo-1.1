import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createTelegramService } from '@/lib/services/telegramService';
import { createCronLogger } from '@/lib/logger';
import { verifyOrgGroupAccess } from '@/lib/server/orgGroupAccess';

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
    const supabaseService = createAdminServer();

    // Получаем все организации с Telegram группами
    // Сначала получаем все связи org -> telegram_groups
    const { data: orgGroupLinks, error: linksError } = await adminSupabase
      .from('org_telegram_groups')
      .select('org_id, tg_chat_id');

    if (linksError) {
      logger.error({ error: linksError.message }, 'Error fetching org_telegram_groups');
      return NextResponse.json({ error: 'Failed to fetch organizations' }, { status: 500 });
    }

    // Получаем уникальные org_ids и tg_chat_ids
    const orgIds: string[] = Array.from(new Set(orgGroupLinks?.map((link: any) => link.org_id as string) || []));
    const chatIds: string[] = Array.from(new Set(orgGroupLinks?.map((link: any) => String(link.tg_chat_id)) || []));

    // Получаем организации и группы параллельно
    const [orgsResult, groupsResult] = await Promise.all([
      adminSupabase.from('organizations').select('id, name').in('id', orgIds),
      adminSupabase.from('telegram_groups').select('tg_chat_id, title, bot_status').in('tg_chat_id', chatIds)
    ]);

    const orgsMap = new Map<string, any>(orgsResult.data?.map((o: any) => [o.id, o]) || []);
    // Normalize tg_chat_id to string for consistent Map lookups (bigint can be number or string)
    const groupsMap = new Map<string, any>(groupsResult.data?.map((g: any) => [String(g.tg_chat_id), g]) || []);

    // Группируем связи по org_id
    const orgGroupsMap = new Map<string, any[]>();
    orgGroupLinks?.forEach((link: any) => {
      if (!orgGroupsMap.has(link.org_id)) {
        orgGroupsMap.set(link.org_id, []);
      }
      orgGroupsMap.get(link.org_id)!.push(link);
    });

    // Формируем результат в том же формате
    const orgs = orgIds.map(orgId => {
      const org = orgsMap.get(orgId);
      const links = orgGroupsMap.get(orgId) || [];
      return {
        id: orgId,
        name: org?.name || 'Unknown',
        org_telegram_groups: links.map(link => ({
          tg_chat_id: link.tg_chat_id,
          telegram_groups: groupsMap.get(String(link.tg_chat_id)) || null
        }))
      };
    }).filter(org => org.org_telegram_groups.length > 0);

    logger.info({ orgs_count: orgs.length }, 'Found organizations with Telegram groups');

    const results: any[] = [];
    const telegramService = createTelegramService('main');

    // Cache for getChatAdministrators results: one chat can be bound to multiple orgs,
    // but admin list only needs to be fetched once per run. Saves ~2-3x Telegram API load.
    // Value: admins array on success, null on failure, undefined = not yet fetched.
    const adminsCache = new Map<string, any[] | null>();
    // Track chats where telegram_group_admins has already been upserted this run
    // (prevents duplicate DB writes for the same chat bound to multiple orgs)
    const chatsUpsertedThisRun = new Set<string>();

    for (const org of orgs || []) {
      logger.debug({ org_id: org.id, org_name: org.name }, 'Processing org');

      // Получаем все активные группы организации
      const orgLinks = org.org_telegram_groups || [];

      let updatedGroups = 0;
      // Track which groups we successfully synced this run
      // Only groups that were successfully updated should undergo the revoke check
      const successfullySyncedChats = new Set<string>();

      for (const groupBinding of orgLinks) {
        const chatId = groupBinding.tg_chat_id;
        const groupData = groupsMap.get(String(chatId));
        const groupTitle = groupData?.title || chatId;
        const botStatus = groupData?.bot_status;

        // Пропускаем группы, где бот неактивен или требуется миграция
        if (botStatus === 'inactive' || botStatus === 'migration_needed') {
          logger.debug({ chat_id: chatId, bot_status: botStatus }, 'Skipping group with non-active bot status');
          continue;
        }

        // Пропускаем личные чаты (положительный chat_id) — они не могут быть группами
        if (Number(chatId) > 0) {
          logger.debug({ chat_id: chatId }, 'Skipping positive chat_id (private chat)');
          continue;
        }

        try {
          // Check cache first (one chat may be bound to multiple orgs)
          const cacheKey = String(chatId);
          let administrators: any[] | null | undefined = adminsCache.get(cacheKey);

          if (administrators === undefined) {
            // Not cached — fetch from Telegram.
            // Tiny pause between groups so we don't slam the outbound channels
            // when a worker/proxy hiccup happens — it avoids cascading every
            // call into "all channels in cooldown" land for the whole run.
            await new Promise((r) => setTimeout(r, 150));
            logger.debug({ chat_id: chatId, group_title: groupTitle }, 'Fetching admins for group');
            const adminsResponse = await telegramService.getChatAdministrators(Number(chatId));

            if (!adminsResponse.ok) {
              const errDesc = adminsResponse.description || 'Unknown error';

              // "member list is inaccessible" — бот не имеет прав или группа ограничена
              // Помечаем как inactive, чтобы не опрашивать каждый цикл
              if (errDesc.includes('member list is inaccessible')) {
                logger.warn({
                  chat_id: chatId,
                  group_title: groupTitle,
                  org_id: org.id,
                }, 'Member list inaccessible — marking group as inactive');

                await supabaseService
                  .from('telegram_groups')
                  .update({
                    bot_status: 'inactive',
                    last_sync_at: new Date().toISOString()
                  })
                  .eq('tg_chat_id', chatId);
                adminsCache.set(cacheKey, null); // cache failure
                continue;
              }

              logger.warn({
                chat_id: chatId,
                error: errDesc
              }, 'Failed to get admins for chat');
              adminsCache.set(cacheKey, null); // cache failure
              continue;
            }

            administrators = adminsResponse.result || [];
            adminsCache.set(cacheKey, administrators);
            logger.debug({ chat_id: chatId, admins_count: administrators.length }, 'Found administrators in group');
          } else if (administrators === null) {
            // Previous fetch in this run failed — skip this org's binding silently
            continue;
          }
          // administrators is now the cached array

          // Safety guard: if API unexpectedly returned 0 admins (can happen when
          // the bot has restricted permissions), skip to avoid wiping admin data.
          // A real supergroup always has at least one admin (the creator).
          if (administrators.length === 0) {
            logger.warn({
              chat_id: chatId,
              group_title: groupTitle,
              org_id: org.id,
            }, 'Empty admin list returned — skipping to preserve existing data');
            continue;
          }

          // 1. Upsert current admins FIRST (so we never have a gap where admin data is missing)
          // Skip DB upsert if this chat was already synced in this run (another org had same chat)
          const currentAdminUserIds: number[] = [];
          const alreadyUpserted = chatsUpsertedThisRun.has(String(chatId));

          for (const admin of administrators) {
            const user = admin.user;
            if (!user || !user.id) continue;

            // Пропускаем ботов (кроме нашего бота, если нужно отслеживать его статус отдельно)
            if (user.is_bot && user.id !== Number(process.env.TELEGRAM_BOT_ID)) continue;

            currentAdminUserIds.push(user.id);
            if (alreadyUpserted) continue; // skip actual DB write, but still collect IDs

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

          // 2. Expire records for users NO LONGER in the admin list (skip if already done)
          if (!alreadyUpserted && currentAdminUserIds.length > 0) {
            await supabaseService.raw(
              `UPDATE telegram_group_admins
               SET is_admin = false, is_owner = false,
                   verified_at = NOW(),
                   expires_at = NOW() + INTERVAL '1 second'
               WHERE tg_chat_id = $1
                 AND tg_user_id NOT IN (${currentAdminUserIds.map((_, i) => `$${i + 2}`).join(',')})
                 AND is_admin = true`,
              [String(chatId), ...currentAdminUserIds]
            );
            chatsUpsertedThisRun.add(String(chatId));
          }

          successfullySyncedChats.add(String(chatId));
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
                  // Получаем данные старой группы (invite_link removed in migration 071)
                  const { data: oldGroup } = await supabaseService
                    .from('telegram_groups')
                    .select('title, member_count')
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
        const { data: syncResult, error: syncError } = await supabaseService.rpc(
          'sync_telegram_admins',
          { p_org_id: org.id }
        );

        if (syncError) {
          logger.error({ org_id: org.id, error: syncError.message }, 'Error syncing memberships for org');
        } else {
          // Debug level: only visible with log level debug; avoids spamming info log
          logger.debug({ org_id: org.id, sync_result: syncResult, updated_groups: updatedGroups }, 'Memberships synced for org');
        }
      }

      // Revoke check: only for groups that were SUCCESSFULLY synced this run.
      // Groups where API calls failed are skipped to avoid false positives from proxy timeouts.
      let revokedCount = 0;
      let restoredCount = 0;
      for (const groupBinding of orgLinks) {
        const chatId = groupBinding.tg_chat_id;
        const grpData = groupsMap.get(String(chatId));
        const groupBotStatus = grpData?.bot_status;
        if (groupBotStatus === 'inactive' || groupBotStatus === 'migration_needed') continue;

        // Skip revoke check if we didn't successfully sync this group
        // (API failed, proxy timeout, etc.) — preserve existing status
        if (!successfullySyncedChats.has(String(chatId))) {
          continue;
        }

        try {
          // Read current status first — we only need to act on transitions
          const { data: currentBinding } = await supabaseService
            .from('org_telegram_groups')
            .select('status')
            .eq('org_id', org.id)
            .eq('tg_chat_id', chatId)
            .maybeSingle();

          const currentStatus = (currentBinding as any)?.status as string | undefined;
          // Skip records that don't exist or are in other statuses we don't manage here
          if (currentStatus !== 'active' && currentStatus !== 'access_revoked') continue;

          const hasAccess = await verifyOrgGroupAccess(org.id, chatId);

          if (!hasAccess && currentStatus === 'active') {
            // Transition: active → access_revoked
            await supabaseService
              .from('org_telegram_groups')
              .update({ status: 'access_revoked' })
              .eq('org_id', org.id)
              .eq('tg_chat_id', chatId)
              .eq('status', 'active');
            revokedCount++;
            logger.warn({
              org_id: org.id, tg_chat_id: chatId,
            }, 'Group marked as access_revoked — no org admin has TG admin rights');
          } else if (hasAccess && currentStatus === 'access_revoked') {
            // Transition: access_revoked → active
            await supabaseService
              .from('org_telegram_groups')
              .update({ status: 'active' })
              .eq('org_id', org.id)
              .eq('tg_chat_id', chatId)
              .eq('status', 'access_revoked');
            restoredCount++;
            logger.info({
              org_id: org.id, tg_chat_id: chatId,
            }, 'Group access restored');
          }
          // No transition: no log, no update — silent
        } catch (e: any) {
          logger.warn({ org_id: org.id, tg_chat_id: chatId, error: e.message }, 'Error checking group access');
        }
      }

      results.push({
        org_id: org.id,
        org_name: org.name,
        updated_groups: updatedGroups,
        total_groups: orgLinks.length,
        revoked_groups: revokedCount,
        restored_groups: restoredCount,
      });
    }

    // Aggregate totals for summary log
    const totalRevoked = results.reduce((s, r) => s + (r.revoked_groups || 0), 0);
    const totalRestored = results.reduce((s, r) => s + ((r as any).restored_groups || 0), 0);
    const totalUpdated = results.reduce((s, r) => s + (r.updated_groups || 0), 0);
    const duration = Date.now() - startTime;

    logger.info({
      duration_ms: duration,
      organizations_processed: results.length,
      groups_synced: totalUpdated,
      status_changes_to_revoked: totalRevoked,
      status_changes_to_restored: totalRestored,
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

