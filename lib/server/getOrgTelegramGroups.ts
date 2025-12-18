import { createAdminServer } from '@/lib/server/supabaseServer';
import { createServiceLogger } from '@/lib/logger';

export interface OrgTelegramGroup {
  id: number;
  tg_chat_id: string;
  title: string | null;
  invite_link?: string | null;
  bot_status?: string | null;
  member_count?: number | null;
  new_members_count?: number | null;
  org_id: string;
  primary_org_id?: string | null;
  mapped_org_ids?: string[];
  is_primary?: boolean;
  status?: string;
  archived_reason?: string | null;
}

export async function getOrgTelegramGroups(orgId: string): Promise<OrgTelegramGroup[]> {
  const logger = createServiceLogger('getOrgTelegramGroups');
  const supabase = createAdminServer();

  const groupsMap = new Map<string, OrgTelegramGroup>();
  // Note: primaryOrgIds was removed - telegram_groups.org_id doesn't exist anymore
  // All org relationships are determined by org_telegram_groups table

  const normalizeChatId = (value: any): string => String(value);
  const filterActiveGroups = (groups: any[] | null | undefined) =>
    (groups ?? []).filter(group => group && group.is_archived !== true);

  const fetchGroupsForChatIds = async (chatIds: string[]): Promise<any[]> => {
    const uniqueIds = Array.from(new Set(chatIds.filter(Boolean)));
    if (uniqueIds.length === 0) {
      return [];
    }

    const numericIds = uniqueIds
      .map(id => {
        const parsed = Number(id);
        return Number.isNaN(parsed) ? null : parsed;
      })
      .filter((value): value is number => value !== null);

    // Сначала пробуем получить группы по числовым идентификаторам (основной кейс)
    if (numericIds.length > 0) {
      const { data, error } = await supabase
        .from('telegram_groups')
        .select('*')
        .in('tg_chat_id', numericIds);

      if (!error && data && data.length > 0) {
        return filterActiveGroups(data);
      }

      if (error && error.code !== '22P02') {
        logger.warn({ 
          error: error.message,
          error_code: error.code,
          org_id: orgId
        }, 'Numeric tg_chat_id lookup failed, falling back to text values');
      }
    }

    // Фоллбэк — поиск по строковым значениям (на случай текстового tg_chat_id)
    const { data: textMatches, error: textError } = await supabase
      .from('telegram_groups')
      .select('*')
      .in('tg_chat_id', uniqueIds);

    if (textError) {
      logger.error({ 
        error: textError.message,
        error_code: textError.code,
        org_id: orgId
      }, 'Text tg_chat_id lookup failed');
      return [];
    }

    return filterActiveGroups(textMatches);
  };

  const assignGroup = (chatId: string, payload: Partial<OrgTelegramGroup>) => {
    const existing = groupsMap.get(chatId);
    const mergedMappedOrgIds = new Set<string>(existing?.mapped_org_ids ?? []);

    if (payload.mapped_org_ids) {
      payload.mapped_org_ids.forEach(org => mergedMappedOrgIds.add(org));
    }

    const normalized: OrgTelegramGroup = {
      id: payload.id ?? existing?.id ?? 0,
      tg_chat_id: chatId,
      title: payload.title ?? existing?.title ?? null,
      invite_link: payload.invite_link ?? existing?.invite_link ?? null,
      bot_status: payload.bot_status ?? existing?.bot_status ?? null,
      member_count: payload.member_count ?? existing?.member_count ?? null,
      new_members_count: payload.new_members_count ?? existing?.new_members_count ?? null,
      org_id: payload.org_id ?? existing?.org_id ?? orgId,
      primary_org_id: payload.primary_org_id ?? existing?.primary_org_id ?? null,
      mapped_org_ids: Array.from(mergedMappedOrgIds.size > 0 ? mergedMappedOrgIds : new Set([orgId])),
      is_primary: payload.is_primary ?? existing?.is_primary ?? false,
      status: payload.status ?? existing?.status ?? 'active',
      archived_reason: payload.archived_reason ?? existing?.archived_reason ?? null
    };

    groupsMap.set(chatId, normalized);
  };

  // Note: telegram_groups.org_id column was removed (migration 071)
  // All org relationships are managed through org_telegram_groups table only

  // 2. Связи через org_telegram_groups (мульти-организации)
  type MappingRow = { tg_chat_id: string; status: string; archived_reason: string | null };
  let mappingRows: MappingRow[] = [];

  try {
    const { data: mappingData, error: mappingError } = await supabase
      .from('org_telegram_groups')
      .select('tg_chat_id, status, archived_reason')
      .eq('org_id', orgId);

    if (mappingError) {
      if (mappingError.code === '42703') {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('org_telegram_groups')
          .select('tg_chat_id')
          .eq('org_id', orgId);

        if (fallbackError) {
          throw fallbackError;
        }

        mappingRows = (fallbackData ?? []).map(row => ({
          tg_chat_id: normalizeChatId(row.tg_chat_id),
          status: 'active',
          archived_reason: null
        }));
      } else {
        throw mappingError;
      }
    } else {
      mappingRows = (mappingData ?? []).map(row => ({
        tg_chat_id: normalizeChatId(row.tg_chat_id),
        status: row.status ?? 'active',
        archived_reason: row.archived_reason ?? null
      }));
    }
  } catch (mappingError: any) {
    if (mappingError?.code === '42P01') {
      logger.warn({ org_id: orgId }, 'org_telegram_groups table not found while fetching org group mappings');
    } else {
      logger.error({ 
        error: mappingError?.message || String(mappingError),
        error_code: mappingError?.code,
        org_id: orgId
      }, 'Error loading org telegram group mappings');
    }
    mappingRows = [];
  }

  const activeMappings = mappingRows.filter(row => row.status === 'active' || row.status === undefined || row.status === null);
  const activeChatIds = activeMappings.map(row => row.tg_chat_id);

  const mappedGroups = await fetchGroupsForChatIds(activeChatIds);

  mappedGroups.forEach(group => {
    const chatId = normalizeChatId(group.tg_chat_id);
    const mapping = activeMappings.find(row => row.tg_chat_id === chatId);

    // Note: telegram_groups.org_id doesn't exist anymore
    // Primary org is determined by org_telegram_groups mappings
    const mappedOrgIds = [orgId];

    assignGroup(chatId, {
      ...group,
      tg_chat_id: chatId,
      org_id: orgId,
      primary_org_id: orgId, // Current org is primary for this context
      mapped_org_ids: mappedOrgIds,
      is_primary: true, // All groups in this query belong to current org
      status: mapping?.status ?? 'active',
      archived_reason: mapping?.archived_reason ?? null
    });
  });

  // 3. Зачитываем остальные связи, чтобы дополнить mapped_org_ids
  const allChatIds = Array.from(groupsMap.keys());

  if (allChatIds.length > 0) {
    try {
      const { data: allMappingsData, error: allMappingsError } = await supabase
        .from('org_telegram_groups')
        .select('org_id, tg_chat_id, status, archived_reason')
        .in('tg_chat_id', allChatIds);

      type AllMappingRow = {
        org_id: string | null;
        tg_chat_id: string;
        status?: string | null;
        archived_reason?: string | null;
      };

      let allMappings: AllMappingRow[] = (allMappingsData ?? []).map(row => ({
        org_id: row.org_id,
        tg_chat_id: normalizeChatId(row.tg_chat_id),
        status: row.status ?? undefined,
        archived_reason: row.archived_reason ?? null
      }));

      if (allMappingsError) {
        if (allMappingsError.code === '42703') {
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('org_telegram_groups')
            .select('org_id, tg_chat_id')
            .in('tg_chat_id', allChatIds);

          if (fallbackError) {
            throw fallbackError;
          }

          allMappings = (fallbackData ?? []).map(row => ({
            org_id: row.org_id,
            tg_chat_id: normalizeChatId(row.tg_chat_id),
            status: undefined,
            archived_reason: null
          }));
        } else {
          throw allMappingsError;
        }
      }

      const mappingAccumulator = new Map<string, { orgs: Set<string>; archivedReason: string | null; status: string | undefined }>();

      allMappings.forEach(mapping => {
        const chatId = normalizeChatId(mapping.tg_chat_id);
        if (!mappingAccumulator.has(chatId)) {
          mappingAccumulator.set(chatId, { orgs: new Set(), archivedReason: null, status: undefined });
        }

        const entry = mappingAccumulator.get(chatId)!;

        if (mapping?.org_id) {
          if (!mapping.status || mapping.status === 'active') {
            entry.orgs.add(mapping.org_id);
          }
        }

        if (mapping?.org_id === orgId) {
          entry.archivedReason = mapping?.archived_reason ?? entry.archivedReason ?? null;
          entry.status = mapping?.status ?? entry.status;
        }
      });

      groupsMap.forEach((group, chatId) => {
        const entry = mappingAccumulator.get(chatId);
        const primaryOrgId = group.primary_org_id ?? orgId;
        const mappedOrgIds = new Set(group.mapped_org_ids ?? []);

        if (entry) {
          entry.orgs.forEach(org => mappedOrgIds.add(org));
        }

        if (primaryOrgId) {
          mappedOrgIds.add(primaryOrgId);
        }

        mappedOrgIds.add(orgId);

        assignGroup(chatId, {
          ...group,
          mapped_org_ids: Array.from(mappedOrgIds),
          primary_org_id: primaryOrgId,
          is_primary: primaryOrgId === orgId,
          status: entry?.status ?? group.status ?? 'active',
          archived_reason: entry?.archivedReason ?? group.archived_reason ?? null
        });
      });
    } catch (allMappingsError: any) {
      if (allMappingsError?.code === '42P01') {
        logger.warn({ org_id: orgId }, 'org_telegram_groups table not found while enriching mappings');
      } else {
        logger.error({ 
          error: allMappingsError?.message || String(allMappingsError),
          error_code: allMappingsError?.code,
          org_id: orgId
        }, 'Error loading mapping metadata');
      }
    }
  }

  const groups = Array.from(groupsMap.values())
    .filter(group => {
      // Filter by org_telegram_groups.status (must be active)
      if (group.status && group.status !== 'active') return false;
      
      // Filter out groups where bot is pending/inactive (they show in "Pending" section)
      // bot_status values: 'active', 'pending', 'inactive', 'migration_needed', etc.
      const pendingStatuses = ['pending', 'inactive', 'migration_needed'];
      if (group.bot_status && pendingStatuses.includes(group.bot_status)) return false;
      
      return true;
    })
    .sort((a, b) => (a.title || '').localeCompare(b.title || ''));

  return groups;
}

