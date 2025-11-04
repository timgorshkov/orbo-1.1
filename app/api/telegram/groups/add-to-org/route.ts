import { NextResponse } from 'next/server';
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer';

export const dynamic = 'force-dynamic';

/**
 * Копирует участников Telegram-группы в новую организацию
 */
async function copyGroupParticipantsToOrg(
  supabase: any,
  tgChatId: string,
  targetOrgId: string
) {
  console.log(`[CopyParticipants] Starting copy for group ${tgChatId} to org ${targetOrgId}`);

  // 1. Получаем всех участников группы из participant_groups
  const { data: groupParticipants, error: pgError } = await supabase
    .from('participant_groups')
    .select(`
      participant_id,
      participants!inner (
        id,
        tg_user_id,
        full_name,
        username,
        phone,
        email,
        photo_url,
        source,
        participant_status,
        custom_attributes,
        bio
      )
    `)
    .eq('tg_group_id', tgChatId);

  if (pgError) {
    console.error('[CopyParticipants] Error fetching group participants:', pgError);
    return;
  }

  if (!groupParticipants || groupParticipants.length === 0) {
    console.log('[CopyParticipants] No participants found in this group');
    return;
  }

  console.log(`[CopyParticipants] Found ${groupParticipants.length} participants in group`);

  let created = 0;
  let skipped = 0;

  // 2. Для каждого участника проверяем/создаем запись в новой организации
  for (const gp of groupParticipants) {
    const participant = gp.participants;

    if (!participant || !participant.tg_user_id) {
      console.log('[CopyParticipants] Skipping participant without tg_user_id');
      skipped++;
      continue;
    }

    // Проверяем, есть ли уже participant в целевой организации с таким tg_user_id
    const { data: existing } = await supabase
      .from('participants')
      .select('id')
      .eq('org_id', targetOrgId)
      .eq('tg_user_id', participant.tg_user_id)
      .is('merged_into', null)
      .maybeSingle();

    if (existing) {
      console.log(`[CopyParticipants] Participant ${participant.tg_user_id} already exists in org`);
      
      // Проверяем, есть ли связь в participant_groups
      const { data: existingPG } = await supabase
        .from('participant_groups')
        .select('id')
        .eq('participant_id', existing.id)
        .eq('tg_group_id', tgChatId)
        .maybeSingle();

      if (!existingPG) {
        // Добавляем связь
        await supabase
          .from('participant_groups')
          .insert({
            participant_id: existing.id,
            tg_group_id: tgChatId
          });
        console.log(`[CopyParticipants] Added participant_groups link for ${participant.tg_user_id}`);
      }
      
      skipped++;
      continue;
    }

    // Создаем нового participant для целевой организации
    const { data: newParticipant, error: insertError } = await supabase
      .from('participants')
      .insert({
        org_id: targetOrgId,
        tg_user_id: participant.tg_user_id,
        full_name: participant.full_name,
        username: participant.username,
        phone: participant.phone,
        email: participant.email,
        photo_url: participant.photo_url,
        source: 'telegram_group',
        participant_status: participant.participant_status || 'participant',
        // ✅ НЕ копируем bio и custom_attributes из другой организации
        custom_attributes: {},
        bio: null
      })
      .select('id')
      .single();

    if (insertError) {
      console.error(`[CopyParticipants] Error creating participant ${participant.tg_user_id}:`, insertError);
      continue;
    }

    // Создаем связь participant_groups для новой организации
    const { error: pgLinkError } = await supabase
      .from('participant_groups')
      .insert({
        participant_id: newParticipant.id,
        tg_group_id: tgChatId
      });

    if (pgLinkError) {
      console.error(`[CopyParticipants] Error linking participant to group:`, pgLinkError);
      // Не прерываем, продолжаем с другими
    }

    created++;
    console.log(`[CopyParticipants] Created participant ${participant.tg_user_id} for org ${targetOrgId}`);
  }

  console.log(`[CopyParticipants] Completed: ${created} created, ${skipped} skipped`);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { groupId, orgId } = body;
    
    if (!groupId || !orgId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }
    
    // Получаем текущего пользователя
    const supabase = await createClientServer();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    console.log(`Adding group ${groupId} to org ${orgId} by user ${user.id}`);
    
    // Используем сервисную роль для обхода RLS политик
    const supabaseService = createAdminServer();
    
    // Проверяем, что пользователь имеет доступ к организации
    const { data: membership, error: membershipError } = await supabaseService
      .from('memberships')
      .select('*')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .single();
      
    if (membershipError || !membership) {
      console.error('Error checking membership:', membershipError);
      return NextResponse.json({ 
        error: 'You do not have access to this organization' 
      }, { status: 403 });
    }
    
    // Проверяем, что группа существует и не привязана к другой организации
    const { data: group, error: groupError } = await supabaseService
      .from('telegram_groups')
      .select('*')
      .eq('id', groupId)
      .single();

    if (groupError || !group) {
      console.error('Error fetching group:', groupError);
      return NextResponse.json({ 
        error: 'Group not found' 
      }, { status: 404 });
    }
    
    // Приводим tg_chat_id к строке для совместимости с БД
    const tgChatIdStr = String(group.tg_chat_id);
    console.log(`Group tg_chat_id: ${tgChatIdStr} (original type: ${typeof group.tg_chat_id})`);
    
    // Проверяем, что пользователь является администратором группы
    // Получаем все верифицированные Telegram аккаунты пользователя
    const { data: telegramAccounts, error: accountsError } = await supabaseService
      .from('user_telegram_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_verified', true);
      
    if (accountsError) {
      console.error('Error fetching Telegram accounts:', accountsError);
      return NextResponse.json({ 
        error: 'Error fetching Telegram accounts',
        details: accountsError
      }, { status: 500 });
    }
    
    if (!telegramAccounts || telegramAccounts.length === 0) {
      console.log(`No verified Telegram accounts found for user ${user.id}`);
      return NextResponse.json({ 
        error: 'No verified Telegram accounts found for this user' 
      }, { status: 400 });
    }
    
    // Ищем аккаунт для текущей организации
    const telegramAccount = telegramAccounts.find(account => account.org_id === orgId);
    
    // Выбираем аккаунт для текущей организации или первый доступный
    const activeAccount = telegramAccount || telegramAccounts[0];
    
    console.log(`Using Telegram account: ${activeAccount.telegram_user_id} (from org: ${activeAccount.org_id})`);
    
    // Проверяем права администратора
    const { data: adminRights, error: adminError } = await supabaseService
      .from('telegram_group_admins')
      .select('*')
      .eq('tg_chat_id', tgChatIdStr)
      .eq('tg_user_id', activeAccount.telegram_user_id)
      .eq('is_admin', true)
      .single();

    if (adminError || !adminRights || !adminRights.is_admin) {
      console.error('Error checking admin rights:', adminError);
      return NextResponse.json({
        error: 'Grant admin permissions to @orbo_community_bot before adding the group'
      }, { status: 400 });
    }

    if (adminRights.bot_status !== 'connected' && group.bot_status !== 'connected') {
      return NextResponse.json({
        error: 'Grant admin permissions to @orbo_community_bot before adding the group'
      }, { status: 400 });
    }

    console.log(`Checking existing mapping for org ${orgId}, group tg_chat_id: ${tgChatIdStr}`);

    // Проверяем существование записи (без `status`, так как этот столбец может не существовать)
    const { data: existingMapping, error: mappingCheckError } = await supabaseService
      .from('org_telegram_groups')
      .select('org_id, tg_chat_id, created_at')
      .eq('org_id', orgId)
      .eq('tg_chat_id', tgChatIdStr)
      .maybeSingle();

    if (mappingCheckError) {
      console.error('Error checking group mapping:', {
        code: mappingCheckError.code,
        message: mappingCheckError.message,
        details: mappingCheckError.details,
        hint: mappingCheckError.hint,
        tg_chat_id: tgChatIdStr,
        tg_chat_id_type: typeof tgChatIdStr
      });
      
      // Код 42P01 означает, что таблица не существует - это нормально для старых установок
      if (mappingCheckError.code !== '42P01') {
        return NextResponse.json({ 
          error: 'Failed to check existing group mapping',
          details: mappingCheckError.message 
        }, { status: 500 });
      }
      
      console.log('org_telegram_groups table not found, will use legacy fallback');
    }

    try {
      if (existingMapping) {
        console.log(`Mapping already exists for group ${tgChatIdStr} in org ${orgId}, created at: ${existingMapping.created_at}`);
        // Группа уже добавлена - возвращаем успех
        return NextResponse.json({
          success: true,
          message: 'Group already linked to this organization',
          groupId: group.id,
          tgChatId: tgChatIdStr
        });
      } else {
        console.log(`Creating new mapping for group ${tgChatIdStr} in org ${orgId}`);
        // Не указываем status - если столбец существует, он будет использовать default 'active'
        // Если столбца нет, вставка пройдет успешно без него
        await supabaseService
          .from('org_telegram_groups')
          .insert({
            org_id: orgId,
            tg_chat_id: tgChatIdStr,
            created_by: user.id
          });
      }
    } catch (linkError: any) {
      if (linkError?.code === '23505') {
        return NextResponse.json({ error: 'Group already linked to this organization' }, { status: 400 });
      }

      if (linkError?.code === '42P01') {
        console.error('Mapping table org_telegram_groups not found - database schema issue');
        return NextResponse.json({ error: 'Database schema error: org_telegram_groups table missing' }, { status: 500 });
      } else {
        console.error('Error creating group mapping:', linkError);
        return NextResponse.json({ 
          error: 'Failed to link group to organization',
          details: linkError.message || String(linkError)
        }, { status: 500 });
      }
    }

    console.log(`Successfully linked group ${tgChatIdStr} to org ${orgId}`);

    // Копируем участников группы в новую организацию
    await copyGroupParticipantsToOrg(supabaseService, tgChatIdStr, orgId);

    return NextResponse.json({
      success: true,
      message: 'Group linked to organization',
      groupId: group.id,
      tgChatId: tgChatIdStr
    });
  } catch (error: any) {
    console.error('Error in add-to-org:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

