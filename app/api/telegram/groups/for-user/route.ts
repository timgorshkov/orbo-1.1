import { NextResponse } from 'next/server';
import { createAdminServer, createClientServer } from '@/lib/server/supabaseServer';

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
      console.error('Auth error:', safeErrorJson(userError));
      return NextResponse.json({ 
        error: 'Unauthorized', 
        groups: [],
        availableGroups: []
      }, { status: 401 });
    }
    
    console.log(`Fetching groups for user ${user.id} in org ${orgId}`);
    
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
        console.error('Error fetching Telegram accounts:', safeErrorJson(accountsError));
        return NextResponse.json({
          error: 'Failed to fetch Telegram accounts',
          details: 'Could not retrieve verified Telegram accounts',
          groups: [],
          availableGroups: []
        }, { status: 500 });
      }
      
      if (!telegramAccounts || telegramAccounts.length === 0) {
        console.log(`No verified Telegram accounts found for user ${user.id}`);
        return NextResponse.json({ 
          groups: [],
          availableGroups: [],
          message: 'No verified Telegram accounts found for this user'
        });
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
      
      try {
        console.log(`Querying telegram_group_admins for tg_user_id: ${activeAccount.telegram_user_id}`);
        
        // Получаем все группы, где пользователь является администратором
        console.log('SQL query for telegram_group_admins:');
        console.log(`SELECT * FROM telegram_group_admins WHERE tg_user_id = '${activeAccount.telegram_user_id}' AND is_admin = true`);
        
        // Получаем записи из telegram_group_admins
        const { data: adminRights, error: adminRightsError } = await supabaseService
          .from('telegram_group_admins')
          .select('*')
          .eq('tg_user_id', activeAccount.telegram_user_id)
          .eq('is_admin', true);
          
        if (adminRightsError) {
          console.error('Error fetching admin rights:', safeErrorJson(adminRightsError));
          return NextResponse.json({ 
            error: 'Failed to fetch admin rights',
            details: 'Database error when retrieving admin rights',
            groups: [],
            availableGroups: []
          }, { status: 500 });
        }
        
        console.log(`Found ${adminRights?.length || 0} admin rights records for user ${activeAccount.telegram_user_id}`);
        
        // ✅ НОВОЕ: Также получаем ВСЕ группы с bot_status='connected' для показа с предупреждением
        const { data: connectedGroups, error: connectedError } = await supabaseService
          .from('telegram_groups')
          .select('tg_chat_id')
          .eq('bot_status', 'connected');
        
        if (connectedError) {
          console.error('Error fetching connected groups:', safeErrorJson(connectedError));
        }
        
        console.log(`Found ${connectedGroups?.length || 0} groups with connected bot`);
        
        // Собираем chat_id из обоих источников
        const chatIdsFromAdminRights = new Set((adminRights || []).map(right => String(right.tg_chat_id)));
        const chatIdsFromConnected = new Set((connectedGroups || []).map(group => String(group.tg_chat_id)));
        
        // Объединяем
        const allChatIds = new Set([
          ...Array.from(chatIdsFromAdminRights), 
          ...Array.from(chatIdsFromConnected)
        ]);
        
        if (allChatIds.size === 0) {
          console.log(`No groups found for user ${activeAccount.telegram_user_id}`);
          return NextResponse.json({
            groups: [],
            availableGroups: [],
            message: 'No groups found'
          });
        }
        
        console.log(`Chat IDs to fetch: ${Array.from(allChatIds).join(', ')}`);
        
        // Получаем группы и их связи с организациями
        const chatIdValues = Array.from(allChatIds);

        let groups: any[] | null = null;
        let lastError: any = null;

        const fetchGroupsBatch = async (ids: (string | number)[], includeArchived = false) => {
          if (!ids || ids.length === 0) {
            return { data: [] as any[], error: null };
          }

          try {
            const query = supabaseService
              .from('telegram_groups')
              .select('*')
              .in('tg_chat_id', ids);

            if (!includeArchived) {
              try {
                query.eq('is_archived', false);
              } catch (filterError: any) {
                // Если столбца нет, просто игнорируем фильтр
                console.warn('Failed to apply is_archived filter, possibly missing column:', safeErrorJson(filterError));
              }
            }

            const { data, error } = await query;

            if (error) {
              if (error.code === '42703') {
                console.warn('Column missing while fetching groups, falling back without archive filter');
                const { data: fallbackData, error: fallbackError } = await supabaseService
                  .from('telegram_groups')
                  .select('*')
                  .in('tg_chat_id', ids);

                return {
                  data: (fallbackData || []).filter(group => includeArchived || group?.is_archived !== true),
                  error: fallbackError
                };
              }

              return { data: [] as any[], error };
            }

            return { data: (data || []).filter(group => includeArchived || group?.is_archived !== true), error: null };
          } catch (fetchError: any) {
            return { data: [] as any[], error: fetchError };
          }
        };

        const primaryResult = await fetchGroupsBatch(chatIdValues);
        if (primaryResult.error) {
          console.warn('Primary groups query failed, attempting fallback with numeric IDs:', safeErrorJson(primaryResult.error));
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
          console.error('Error fetching groups:', safeErrorJson(lastError));
          return NextResponse.json({ 
            error: 'Failed to fetch groups',
            details: 'Database error when retrieving groups',
            groups: [],
            availableGroups: []
          }, { status: 500 });
        }
        
        if (!groups || groups.length === 0) {
          console.log(`No groups found for chat IDs: ${chatIdValues.join(', ')}`);
          return NextResponse.json({
            groups: [],
            availableGroups: [],
            message: 'No groups found'
          });
        }
        
        console.log(`Found ${groups.length} groups`);
        
        // Объединяем данные из adminRights и groups
        let mappings: any[] = [];
        try {
          const { data: mappingRows, error: mappingRowsError } = await supabaseService
            .from('org_telegram_groups')
            .select('org_id, tg_chat_id, status, archived_reason')
            .in('tg_chat_id', chatIdValues);

          if (mappingRowsError) {
            if (mappingRowsError.code === '42703') {
              console.warn('status column missing on org_telegram_groups, falling back to basic selection');
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
            let assignedGroups: any[] = [];
            try {
              const { data: groupsWithOrg, error: groupsWithOrgError } = await supabaseService
                .from('telegram_groups')
                .select('tg_chat_id, org_id')
                .in('tg_chat_id', chatIdValues)
                .not('org_id', 'is', null);

              if (groupsWithOrgError) {
                console.warn('groupsWithOrg lookup failed:', safeErrorJson(groupsWithOrgError));
              } else if (groupsWithOrg && groupsWithOrg.length > 0) {
                assignedGroups = groupsWithOrg;
              }
            } catch (fallbackError: any) {
              console.warn('Fallback org mapping lookup failed:', safeErrorJson(fallbackError));
            }

            mappings = assignedGroups.map(group => ({
              org_id: group.org_id,
              tg_chat_id: group.tg_chat_id,
              status: 'active',
              archived_reason: null
            }));
          }
        } catch (mappingError: any) {
          if (mappingError?.code === '42P01') {
            console.warn('Mapping table org_telegram_groups not found while loading groups for user');
            mappings = [];
          } else {
            console.error('Error fetching group mappings:', safeErrorJson(mappingError));
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

          if (groupAny.org_id) {
            mappedOrgIds.add(groupAny.org_id);
          }

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
            console.error(`Error counting members for group ${groupAny.tg_chat_id}:`, countError);
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
            org_id: groupAny.org_id,
            is_admin: hasAdminRights ? right.is_admin : false,
            is_owner: hasAdminRights ? right.is_owner : false,
            admin_verified: hasAdminRights, // 🔴 НОВОЕ: флаг для фронтенда
            verification_status: groupAny.verification_status
          };

          // Детальное логирование для отладки
          console.log(`Group ${groupAny.tg_chat_id} (${groupAny.title}):`, {
            isLinkedToOrg,
            botHasAdminRights,
            hasAdminRights,
            bot_status: groupAny.bot_status,
            org_id: groupAny.org_id,
            mappedOrgIds: Array.from(mappedOrgIds),
            currentOrgId: orgId,
            willBeInExisting: isLinkedToOrg && botHasAdminRights,
            willBeInAvailable: !isLinkedToOrg && botHasAdminRights
          });

          // ✅ НОВАЯ ЛОГИКА: Показываем все подключенные группы
          if (isLinkedToOrg && botHasAdminRights) {
            existingGroups.push(normalizedGroup);
          } else if (!isLinkedToOrg && (botHasAdminRights || groupAny.bot_status === 'connected')) {
            // Показываем группу, даже если нет записи в telegram_group_admins
            // Флаг admin_verified покажет фронтенду, можно ли её добавить
            availableGroups.push(normalizedGroup);
            
            if (!hasAdminRights) {
              console.log(`⚠️ Group ${groupAny.tg_chat_id} will be shown with "grant admin rights" warning`);
            }
          } else {
            console.log(`Group ${groupAny.tg_chat_id} skipped: botHasAdminRights=${botHasAdminRights}, bot_status=${groupAny.bot_status}`);
          }
        }

        console.log(`Returning ${existingGroups.length} existing groups and ${availableGroups.length} available groups`);

        return NextResponse.json({
          groups: includeExisting ? [...existingGroups, ...availableGroups] : existingGroups,
          availableGroups,
          message: `Found ${existingGroups.length} groups for org ${orgId} and ${availableGroups.length} available groups`
        });
      } catch (adminGroupsError: any) {
        console.error('Error processing admin groups:', safeErrorJson(adminGroupsError));
        return NextResponse.json({ 
          error: 'Error processing admin groups',
          details: adminGroupsError instanceof Error ? adminGroupsError.message : String(adminGroupsError),
          groups: [],
          availableGroups: []
        }, { status: 500 });
      }
    } catch (accountError: any) {
      console.error('Error processing telegram account:', safeErrorJson(accountError));
      return NextResponse.json({ 
        error: 'Error processing telegram account',
        details: accountError instanceof Error ? accountError.message : String(accountError),
        groups: [],
        availableGroups: []
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Error in groups for-user:', error instanceof Error ? error.stack : String(error));
    return NextResponse.json({ 
      error: 'Error processing groups',
      details: error instanceof Error ? error.message : String(error),
      groups: [],
      availableGroups: []
    }, { status: 500 });
  }
}
