import { createAdminServer } from '@/lib/server/supabaseServer';

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
  const supabase = createAdminServer();

  const groupsMap = new Map<string, OrgTelegramGroup>();
  const primaryOrgIds = new Map<string, string | null>();

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
        console.warn('Numeric tg_chat_id lookup failed, falling back to text values:', error);
      }
    }

    // Фоллбэк — поиск по строковым значениям (на случай текстового tg_chat_id)
    const { data: textMatches, error: textError } = await supabase
      .from('telegram_groups')
      .select('*')
      .in('tg_chat_id', uniqueIds);

    if (textError) {
      console.error('Text tg_chat_id lookup failed:', textError);
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

  // 1. Прямые связи через поле org_id (legacy-поведение)
  // Note: org_id column may not exist in telegram_groups (new schema uses org_telegram_groups)
  let directGroups: any[] = [];
  try {
    const { data: directGroupsData, error: directError } = await supabase
      .from('telegram_groups')
      .select('*')
      .eq('org_id', orgId);

    if (directError) {
      // Column doesn't exist (42703) - this is expected for new schema
      if (directError.code === '42703') {
        console.log('telegram_groups.org_id column does not exist, skipping direct query (using org_telegram_groups only)');
      } else {
        console.error('Error fetching direct telegram groups:', directError);
      }
    } else {
      directGroups = filterActiveGroups(directGroupsData);
    }
  } catch (err: any) {
    // Silently handle - org_id column may not exist
    if (err?.code !== '42703') {
      console.error('Unexpected error fetching direct groups:', err);
    }
  }

  directGroups.forEach(group => {
    const chatId = normalizeChatId(group.tg_chat_id);
    primaryOrgIds.set(chatId, group.org_id ?? null);
    assignGroup(chatId, {
      ...group,
      tg_chat_id: chatId,
      org_id: orgId,
      primary_org_id: group.org_id ?? null,
      mapped_org_ids: [orgId, group.org_id].filter(Boolean) as string[],
      is_primary: group.org_id === orgId,
      status: 'active'
    });
  });

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
      console.warn('org_telegram_groups table not found while fetching org group mappings');
    } else {
      console.error('Error loading org telegram group mappings:', mappingError);
    }
    mappingRows = [];
  }

  const activeMappings = mappingRows.filter(row => row.status === 'active' || row.status === undefined || row.status === null);
  const activeChatIds = activeMappings.map(row => row.tg_chat_id);

  const mappedGroups = await fetchGroupsForChatIds(activeChatIds);

  mappedGroups.forEach(group => {
    const chatId = normalizeChatId(group.tg_chat_id);
    const mapping = activeMappings.find(row => row.tg_chat_id === chatId);

    primaryOrgIds.set(chatId, group.org_id ?? primaryOrgIds.get(chatId) ?? null);

    const mappedOrgIds = [orgId];
    if (group.org_id) {
      mappedOrgIds.push(group.org_id);
    }

    assignGroup(chatId, {
      ...group,
      tg_chat_id: chatId,
      org_id: orgId,
      primary_org_id: group.org_id ?? primaryOrgIds.get(chatId) ?? null,
      mapped_org_ids: mappedOrgIds,
      is_primary: group.org_id === orgId,
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
        const primaryOrgId = primaryOrgIds.get(chatId) ?? group.primary_org_id ?? null;
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
        console.warn('org_telegram_groups table not found while enriching mappings');
      } else {
        console.error('Error loading mapping metadata:', allMappingsError);
      }
    }
  }

  const groups = Array.from(groupsMap.values())
    .filter(group => !group.status || group.status === 'active')
    .sort((a, b) => (a.title || '').localeCompare(b.title || ''));

  return groups;
}

