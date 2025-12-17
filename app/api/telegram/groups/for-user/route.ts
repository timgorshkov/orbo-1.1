import { NextResponse } from 'next/server';
import { createAdminServer, createClientServer } from '@/lib/server/supabaseServer';
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

export async function GET(request: Request) {
  const logger = createAPILogger(request, { endpoint: '/api/telegram/groups/for-user' });
  try {
    // Получаем параметры запроса
    const url = new URL(request.url);
    const orgId = url.searchParams.get('orgId');
    const includeExisting = url.searchParams.get('includeExisting') === 'true';
    const skipAutoAssign = url.searchParams.get('skipAutoAssign') === 'true';
    
    if (!orgId) {
      return NextResponse.json({ error: 'Missing orgId parameter' }, { status: 400 });
    }
    
    // Получаем текущего пользователя
    const supabase = await createClientServer();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      logger.error({ error: userError?.message }, 'Auth error');
      return NextResponse.json({ 
        error: 'Unauthorized', 
        groups: [],
        availableGroups: []
      }, { status: 401 });
    }
    
    logger.info({ user_id: user.id, org_id: orgId }, 'Fetching groups for user');
    
    // Используем сервисную роль для обхода RLS политик
    const supabaseService = createAdminServer();
    
    try {
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
          details: 'Could not retrieve verified Telegram accounts',
          groups: [],
          availableGroups: []
        }, { status: 500 });
      }
      
      if (!telegramAccounts || telegramAccounts.length === 0) {
        logger.info({ user_id: user.id }, 'No verified Telegram accounts found');
        return NextResponse.json({ 
          groups: [],
          availableGroups: [],
          message: 'No verified Telegram accounts found for this user'
        });
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
      
      try {
        logger.debug({ tg_user_id: activeAccount.telegram_user_id }, 'Querying telegram_group_admins');
        
        // Получаем записи из telegram_group_admins
        const { data: adminRights, error: adminRightsError } = await supabaseService
          .from('telegram_group_admins')
          .select('*')
          .eq('tg_user_id', activeAccount.telegram_user_id)
          .eq('is_admin', true);
          
        if (adminRightsError) {
          logger.error({ error: adminRightsError.message, tg_user_id: activeAccount.telegram_user_id }, 'Error fetching admin rights');
          return NextResponse.json({ 
            error: 'Failed to fetch admin rights',
            details: 'Database error when retrieving admin rights',
            groups: [],
            availableGroups: []
          }, { status: 500 });
        }
        
        logger.debug({ admin_rights_count: adminRights?.length || 0, tg_user_id: activeAccount.telegram_user_id }, 'Found admin rights records');
        
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
        const allChatIds = new Set((adminRights || []).map(right => String(right.tg_chat_id)));
        
        logger.debug({ chat_ids: Array.from(allChatIds), chat_ids_count: allChatIds.size }, 'Chat IDs to fetch');
        
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
            const { data, error } = await supabaseService
              .from('telegram_groups')
              .select('id, tg_chat_id, title, bot_status, last_sync_at, member_count, new_members_count')
              .in('tg_chat_id', ids);

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

          // Считаем реальное количество участников с учётом объединений
          let actualMemberCount = groupAny.member_count || 0;
          try {
            const { count: memberCount } = await supabaseService
              .from('participant_groups')
              .select('*', { count: 'exact', head: true })
              .eq('tg_group_id', groupAny.tg_chat_id)
              .eq('is_active', true);
            
            if (memberCount !== null) {
              actualMemberCount = memberCount;
            }
          } catch (countError) {
            logger.error({ 
              tg_chat_id: groupAny.tg_chat_id,
              error: countError instanceof Error ? countError.message : String(countError)
            }, 'Error counting members for group');
          }

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

        logger.info({ 
          existing_groups_count: existingGroups.length,
          available_groups_count: availableGroups.length
        }, 'Returning groups');

        return NextResponse.json({
          groups: includeExisting ? [...existingGroups, ...availableGroups] : existingGroups,
          availableGroups,
          message: `Found ${existingGroups.length} groups for org ${orgId} and ${availableGroups.length} available groups`
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
