import { NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

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

export async function GET(request: Request) {
  const startTime = Date.now();
  const logger = createAPILogger(request, { endpoint: '/api/telegram/groups/for-user' });
  
  // Helper for timing
  const timings: Record<string, number> = {};
  const track = (label: string, start: number) => {
    timings[label] = Date.now() - start;
  };
  
  try {
    // Получаем параметры запроса
    const url = new URL(request.url);
    const orgId = url.searchParams.get('orgId');
    const includeExisting = url.searchParams.get('includeExisting') === 'true';
    const skipAutoAssign = url.searchParams.get('skipAutoAssign') === 'true';
    
    if (!orgId) {
      return NextResponse.json({ error: 'Missing orgId parameter' }, { status: 400 });
    }
    
    logger.info({ org_id: orgId }, 'Starting groups for-user request');
    
    // Получаем текущего пользователя через unified auth
    const authStart = Date.now();
    const user = await getUnifiedUser();
    track('auth', authStart);
    
    if (!user) {
      logger.error({ timings }, 'Auth error - no user');
      return NextResponse.json({ 
        error: 'Unauthorized', 
        groups: [],
        availableGroups: []
      }, { status: 401 });
    }
    
    logger.info({ 
      user_id: user.id, 
      org_id: orgId,
      auth_duration_ms: timings.auth
    }, 'User authenticated, fetching groups');
    
    // Используем сервисную роль для обхода RLS политик
    const supabaseService = createAdminServer();
    
    try {
      // Получаем все верифицированные Telegram аккаунты пользователя (не только для текущей организации)
      const accountsStart = Date.now();
      const { data: telegramAccounts, error: accountsError } = await supabaseService
        .from('user_telegram_accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_verified', true);
      track('accounts_query', accountsStart);
        
      if (accountsError) {
        logger.error({ 
          error: accountsError.message, 
          user_id: user.id,
          timings 
        }, 'Error fetching Telegram accounts');
        return NextResponse.json({
          error: 'Failed to fetch Telegram accounts',
          details: 'Could not retrieve verified Telegram accounts',
          groups: [],
          availableGroups: []
        }, { status: 500 });
      }
      
      if (!telegramAccounts || telegramAccounts.length === 0) {
        logger.info({ 
          user_id: user.id,
          total_duration_ms: Date.now() - startTime,
          timings 
        }, 'No verified Telegram accounts found');
        return NextResponse.json({ 
          groups: [],
          availableGroups: [],
          message: 'No verified Telegram accounts found for this user'
        });
      }
      
      logger.debug({ 
        accounts_count: telegramAccounts.length, 
        user_id: user.id,
        accounts_query_ms: timings.accounts_query
      }, 'Found verified Telegram accounts');
      
      // Ищем аккаунт для текущей организации
      const telegramAccount = telegramAccounts.find(account => account.org_id === orgId);
      
      // Если нет аккаунта для текущей организации, используем первый доступный
      if (!telegramAccount) {
        logger.debug({ org_id: orgId }, 'No verified Telegram account found for org, using first available account');
      }
      
      // Выбираем аккаунт для текущей организации или первый доступный
      const activeAccount = telegramAccount || telegramAccounts[0];
      
      logger.debug({ telegram_user_id: activeAccount.telegram_user_id, org_id: activeAccount.org_id }, 'Using Telegram account');
      
      try {
        const adminRightsStart = Date.now();
        
        // Получаем записи из telegram_group_admins
        const { data: adminRights, error: adminRightsError } = await supabaseService
          .from('telegram_group_admins')
          .select('*')
          .eq('tg_user_id', activeAccount.telegram_user_id)
          .eq('is_admin', true);
        track('admin_rights_query', adminRightsStart);
          
        if (adminRightsError) {
          logger.error({ 
            error: adminRightsError.message, 
            tg_user_id: activeAccount.telegram_user_id,
            timings 
          }, 'Error fetching admin rights');
          return NextResponse.json({ 
            error: 'Failed to fetch admin rights',
            details: 'Database error when retrieving admin rights',
            groups: [],
            availableGroups: []
          }, { status: 500 });
        }
        
        logger.debug({ 
          admin_rights_count: adminRights?.length || 0, 
          tg_user_id: activeAccount.telegram_user_id,
          admin_rights_query_ms: timings.admin_rights_query
        }, 'Found admin rights records');
        
        // ✅ ИСПРАВЛЕНО: Показываем только группы, где пользователь ДЕЙСТВИТЕЛЬНО админ
        if (!adminRights || adminRights.length === 0) {
          logger.info({ tg_user_id: activeAccount.telegram_user_id }, 'No admin rights found');
          return NextResponse.json({
            groups: [],
            availableGroups: [],
            message: 'You are not an admin in any Telegram groups'
          });
        }
        
        // Собираем chat_id только из admin rights (где пользователь реально админ)
        const rawChatIds = (adminRights || []).map(right => String(right.tg_chat_id));
        
        // 🔄 ОПТИМИЗАЦИЯ: Резолвим миграции ПАРАЛЛЕЛЬНО, не последовательно!
        const migrationResolveStart = Date.now();
        const allChatIds = new Set<string>();
        
        // Запускаем все RPC вызовы параллельно
        const resolvePromises = rawChatIds.map(async (chatId) => {
          try {
            const { data: resolved } = await supabaseService
              .rpc('resolve_telegram_chat_id', { p_chat_id: chatId });
            return resolved || chatId;
          } catch {
            return chatId; // Fallback to original on error
          }
        });
        
        const resolvedChatIds = await Promise.all(resolvePromises);
        resolvedChatIds.forEach(id => allChatIds.add(id));
        track('migration_resolve', migrationResolveStart);
        
        logger.debug({ 
          raw_chat_ids: rawChatIds, 
          resolved_chat_ids: Array.from(allChatIds), 
          chat_ids_count: allChatIds.size,
          migration_resolve_ms: timings.migration_resolve
        }, 'Chat IDs to fetch (after migration resolution)');
        
        // Получаем группы и их связи с организациями
        const chatIdValues = Array.from(allChatIds);

        let groups: any[] | null = null;
        let lastError: any = null;

        const fetchGroupsBatch = async (ids: (string | number)[], includeArchived = false) => {
          if (!ids || ids.length === 0) {
            return { data: [] as any[], error: null };
          }

          try {
            // Select only existing columns (verification_status and other legacy fields removed in migration 080)
            // Also include migrated_to/migrated_from for migration tracking
            const { data, error } = await supabaseService
              .from('telegram_groups')
              .select('id, tg_chat_id, title, bot_status, last_sync_at, member_count, new_members_count, migrated_to, migrated_from')
              .in('tg_chat_id', ids)
              .is('migrated_to', null); // 🔄 Исключаем мигрированные группы (показываем только актуальные)

            if (error) {
              return { data: [] as any[], error };
            }

            return { data: data || [], error: null };
          } catch (fetchError: any) {
            return { data: [] as any[], error: fetchError };
          }
        };

        const primaryResult = await fetchGroupsBatch(chatIdValues);
        if (primaryResult.error) {
          logger.warn({ error: primaryResult.error.message }, 'Primary groups query failed, attempting fallback with numeric IDs');
          lastError = primaryResult.error;
        } else if (primaryResult.data.length > 0) {
          groups = primaryResult.data;
        }

        if (!groups || groups.length === 0) {
          const chatIdsNumeric = chatIdValues
            .map((id: string | number) => (typeof id === 'string' ? id : String(id)))
            .map((id: string) => Number(id))
            .filter((id: number) => !Number.isNaN(id));

          if (chatIdsNumeric.length > 0) {
            const numericResult = await fetchGroupsBatch(chatIdsNumeric);
            if (numericResult.error) {
              lastError = numericResult.error;
            } else if (numericResult.data.length > 0) {
              groups = numericResult.data;
              lastError = null;
            }
          }
        }

        if (!groups || groups.length === 0) {
          const numericWithArchive = await fetchGroupsBatch(chatIdValues, true);
          if (numericWithArchive.error) {
            lastError = numericWithArchive.error;
          } else if (numericWithArchive.data.length > 0) {
            groups = numericWithArchive.data;
            lastError = null;
          }
        }
          
        if ((!groups || groups.length === 0) && lastError) {
          logger.error({ error: lastError.message }, 'Error fetching groups');
          return NextResponse.json({ 
            error: 'Failed to fetch groups',
            details: 'Database error when retrieving groups',
            groups: [],
            availableGroups: []
          }, { status: 500 });
        }
        
        if (!groups || groups.length === 0) {
          logger.info({ chat_ids: chatIdValues }, 'No groups found for chat IDs');
          return NextResponse.json({
            groups: [],
            availableGroups: [],
            message: 'No groups found'
          });
        }
        
        logger.debug({ groups_count: groups.length }, 'Found groups');
        
        // Объединяем данные из adminRights и groups
        let mappings: any[] = [];
        try {
          const { data: mappingRows, error: mappingRowsError } = await supabaseService
            .from('org_telegram_groups')
            .select('org_id, tg_chat_id, status, archived_reason')
            .in('tg_chat_id', chatIdValues);

          if (mappingRowsError) {
            if (mappingRowsError.code === '42703') {
              logger.warn({}, 'status column missing on org_telegram_groups, falling back to basic selection');
              const { data: fallbackRows, error: fallbackError } = await supabaseService
                .from('org_telegram_groups')
                .select('org_id, tg_chat_id')
                .in('tg_chat_id', chatIdValues);

              if (fallbackError) {
                throw fallbackError;
              }

              mappings = (fallbackRows || []).map(row => ({
                org_id: row.org_id,
                tg_chat_id: row.tg_chat_id,
                status: 'active',
                archived_reason: null
              }));
            } else {
              throw mappingRowsError;
            }
          } else {
            mappings = (mappingRows || []).map(row => ({
              org_id: row.org_id,
              tg_chat_id: row.tg_chat_id,
              status: row.status ?? 'active',
              archived_reason: row.archived_reason ?? null
            }));
          }

          if (mappings.length === 0) {
            // Legacy fallback removed: telegram_groups.org_id was removed in migration 071
            // All org-group mappings should be in org_telegram_groups table
            logger.warn({}, 'No org mappings found for these groups. They need to be added to organizations via org_telegram_groups.');
          }
        } catch (mappingError: any) {
          if (mappingError?.code === '42P01') {
            logger.warn({}, 'Mapping table org_telegram_groups not found while loading groups for user');
            mappings = [];
          } else {
            logger.error({ error: mappingError.message }, 'Error fetching group mappings');
            return NextResponse.json({
              error: 'Failed to fetch group mappings',
              details: mappingError instanceof Error ? mappingError.message : String(mappingError),
              groups: [],
              availableGroups: []
            }, { status: 500 });
          }
        }

        const mappingByChat = new Map<string, Set<string>>();
        mappings.forEach(mapping => {
          const key = String(mapping.tg_chat_id);
          if (!mapping?.org_id) {
            return;
          }
          if (!mappingByChat.has(key)) {
            mappingByChat.set(key, new Set());
          }
          mappingByChat.get(key)!.add(mapping.org_id);
        });

        const groupByChatId = new Map<string, any>();
        groups.forEach(group => {
          if (!group) return;
          groupByChatId.set(String(group.tg_chat_id), group);
        });

        // Создаем мапу прав админа для быстрого поиска
        const adminRightsMap = new Map();
        (adminRights || []).forEach(right => {
          adminRightsMap.set(String(right.tg_chat_id), right);
        });

        // ✅ ОПТИМИЗАЦИЯ: Получаем количество участников для ВСЕХ групп одним запросом
        const memberCountsStart = Date.now();
        const memberCountsMap = new Map<string, number>();
        
        try {
          const allChatIdsForCount = Array.from(groupByChatId.keys()).map(id => {
            const num = Number(id);
            return Number.isNaN(num) ? null : num;
          }).filter((id): id is number => id !== null);
          
          if (allChatIdsForCount.length > 0) {
            // Используем RPC или aggregated query вместо count для каждой группы
            const { data: memberCounts, error: countError } = await supabaseService
              .from('participant_groups')
              .select('tg_group_id')
              .in('tg_group_id', allChatIdsForCount)
              .eq('is_active', true);
            
            if (!countError && memberCounts) {
              // Считаем количество записей для каждой группы
              memberCounts.forEach(row => {
                const key = String(row.tg_group_id);
                memberCountsMap.set(key, (memberCountsMap.get(key) || 0) + 1);
              });
            }
          }
        } catch (countError) {
          logger.warn({ 
            error: countError instanceof Error ? countError.message : String(countError)
          }, 'Error batch counting members, will use group.member_count');
        }
        track('member_counts', memberCountsStart);

        const availableGroups = [] as any[];
        const existingGroups = [] as any[];

        // Проходим по ВСЕМ группам (включая те, где нет подтвержденных прав админа)
        for (const [chatKey, group] of Array.from(groupByChatId.entries())) {
          const right = adminRightsMap.get(chatKey);

          const groupAny = group as any;
          const mappedOrgIds = new Set<string>();

          // Legacy: groupAny.org_id removed in migration 071
          // All mappings now come from org_telegram_groups
          const extraMappings = mappingByChat.get(chatKey);
          if (extraMappings) {
            extraMappings.forEach(org => mappedOrgIds.add(org));
          }

          const isLinkedToOrg = mappedOrgIds.has(orgId);
          const botHasAdminRights = groupAny.bot_status === 'connected' || groupAny.bot_status === 'active';

          // ✅ Используем предварительно загруженные counts или fallback на group.member_count
          const actualMemberCount = memberCountsMap.get(chatKey) || groupAny.member_count || 0;

          // ✅ Проверяем, есть ли подтвержденные права админа
          const hasAdminRights = !!right;
          
          const normalizedGroup = {
            id: groupAny.id,
            tg_chat_id: groupAny.tg_chat_id,
            title: groupAny.title || 'Unnamed Group',
            bot_status: groupAny.bot_status,
            member_count: actualMemberCount,
            mapped_org_ids: Array.from(mappedOrgIds),
            org_id: null, // Legacy field removed in migration 071, now using mapped_org_ids
            is_admin: hasAdminRights ? right.is_admin : false,
            is_owner: hasAdminRights ? right.is_owner : false,
            admin_verified: botHasAdminRights // Флаг, что БОТ имеет права админа (для UI)
            // verification_status removed in migration 080
          };

          // Детальное логирование для отладки
          logger.debug({
            tg_chat_id: groupAny.tg_chat_id,
            title: groupAny.title,
            is_linked_to_org: isLinkedToOrg,
            bot_has_admin_rights: botHasAdminRights,
            has_admin_rights: hasAdminRights,
            bot_status: groupAny.bot_status,
            mapped_org_ids: Array.from(mappedOrgIds),
            current_org_id: orgId,
            will_be_in_existing: isLinkedToOrg,
            will_be_in_available: !isLinkedToOrg && hasAdminRights
          }, 'Group processing details');

          // ✅ ИСПРАВЛЕНО: Показываем только группы, где пользователь реально админ
          if (isLinkedToOrg) {
            // Группа уже привязана к этой организации
            existingGroups.push(normalizedGroup);
          } else if (hasAdminRights) {
            // Группа доступна для добавления: пользователь админ (бот может быть pending)
            // На UI будет показано предупреждение, если botHasAdminRights=false
            availableGroups.push(normalizedGroup);
          } else {
            logger.debug({ 
              tg_chat_id: groupAny.tg_chat_id,
              has_admin_rights: hasAdminRights,
              bot_status: groupAny.bot_status
            }, 'Group skipped');
          }
        }

        const totalDuration = Date.now() - startTime;
        
        // Log with severity based on duration
        const logData = {
          existing_groups_count: existingGroups.length,
          available_groups_count: availableGroups.length,
          total_duration_ms: totalDuration,
          timings
        };
        
        if (totalDuration > 5000) {
          logger.error(logData, 'CRITICAL: Groups for-user extremely slow (>5s)');
        } else if (totalDuration > 3000) {
          logger.warn(logData, 'Groups for-user slow (>3s)');
        } else {
          logger.info(logData, 'Returning groups');
        }

        return NextResponse.json({
          groups: includeExisting ? [...existingGroups, ...availableGroups] : existingGroups,
          availableGroups,
          message: `Found ${existingGroups.length} groups for org ${orgId} and ${availableGroups.length} available groups`,
          _debug: { duration_ms: totalDuration }
        });
      } catch (adminGroupsError: any) {
        logger.error({ 
          error: adminGroupsError.message || String(adminGroupsError),
          stack: adminGroupsError.stack
        }, 'Error processing admin groups');
        return NextResponse.json({ 
          error: 'Error processing admin groups',
          details: adminGroupsError instanceof Error ? adminGroupsError.message : String(adminGroupsError),
          groups: [],
          availableGroups: []
        }, { status: 500 });
      }
    } catch (accountError: any) {
      logger.error({ 
        error: accountError.message || String(accountError),
        stack: accountError.stack
      }, 'Error processing telegram account');
      return NextResponse.json({ 
        error: 'Error processing telegram account',
        details: accountError instanceof Error ? accountError.message : String(accountError),
        groups: [],
        availableGroups: []
      }, { status: 500 });
    }
  } catch (error: any) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'Error in groups for-user');
    return NextResponse.json({ 
      error: 'Error processing groups',
      details: error instanceof Error ? error.message : String(error),
      groups: [],
      availableGroups: []
    }, { status: 500 });
  }
}
