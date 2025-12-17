import { NextResponse } from 'next/server';
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer';
import { logErrorToDatabase } from '@/lib/logErrorToDatabase';
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/logAdminAction';
import { createAPILogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * Копирует участников Telegram-группы в новую организацию
 */
async function copyGroupParticipantsToOrg(
  supabase: any,
  tgChatId: string,
  targetOrgId: string,
  logger: ReturnType<typeof createAPILogger>
) {
  logger.info({ tg_chat_id: tgChatId, org_id: targetOrgId }, '[CopyParticipants] Starting copy');

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
    logger.error({ error: pgError.message, tg_chat_id: tgChatId }, '[CopyParticipants] Error fetching group participants');
    return;
  }

  if (!groupParticipants || groupParticipants.length === 0) {
    logger.info({ tg_chat_id: tgChatId }, '[CopyParticipants] No participants found in this group');
    return;
  }

  logger.info({ tg_chat_id: tgChatId, participants_count: groupParticipants.length }, '[CopyParticipants] Found participants');

  let created = 0;
  let skipped = 0;

  // 2. Для каждого участника проверяем/создаем запись в новой организации
  for (const gp of groupParticipants) {
    const participant = gp.participants;

    if (!participant || !participant.tg_user_id) {
      logger.debug({ tg_chat_id: tgChatId }, '[CopyParticipants] Skipping participant without tg_user_id');
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
      logger.debug({ tg_user_id: participant.tg_user_id, org_id: targetOrgId }, '[CopyParticipants] Participant already exists in org');
      
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
        logger.debug({ tg_user_id: participant.tg_user_id }, '[CopyParticipants] Added participant_groups link');
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
      logger.error({ tg_user_id: participant.tg_user_id, error: insertError.message }, '[CopyParticipants] Error creating participant');
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
      logger.error({ tg_user_id: participant.tg_user_id, error: pgLinkError.message }, '[CopyParticipants] Error linking participant to group');
      // Не прерываем, продолжаем с другими
    }

    created++;
    logger.debug({ tg_user_id: participant.tg_user_id, org_id: targetOrgId }, '[CopyParticipants] Created participant');
  }

  logger.info({ created, skipped, tg_chat_id: tgChatId, org_id: targetOrgId }, '[CopyParticipants] Completed');
}

export async function POST(request: Request) {
  const logger = createAPILogger(request, { endpoint: '/api/telegram/groups/add-to-org' });
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
    
    logger.info({ group_id: groupId, org_id: orgId, user_id: user.id }, 'Adding group to org');
    
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
      await logErrorToDatabase({
        level: 'warn',
        message: 'User tried to add group without organization access',
        errorCode: 'TG_GROUP_ADD_INCOMPLETE',
        context: {
          endpoint: '/api/telegram/groups/add-to-org',
          reason: 'no_membership',
          userId: user.id,
          orgId
        },
        userId: user.id,
        orgId
      });
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
      await logErrorToDatabase({
        level: 'warn',
        message: 'Telegram group not found during add-to-org',
        errorCode: 'TG_GROUP_NOT_FOUND',
        context: {
          endpoint: '/api/telegram/groups/add-to-org',
          groupId,
          dbError: groupError?.message
        },
        userId: user.id,
        orgId
      });
      return NextResponse.json({ 
        error: 'Group not found' 
      }, { status: 404 });
    }
    
    // Приводим tg_chat_id к строке для совместимости с БД
    const tgChatIdStr = String(group.tg_chat_id);
    logger.debug({ tg_chat_id: tgChatIdStr, original_type: typeof group.tg_chat_id }, 'Group tg_chat_id');
    
    // Проверяем, что пользователь является администратором группы
    // Получаем все верифицированные Telegram аккаунты пользователя
    const { data: telegramAccounts, error: accountsError } = await supabaseService
      .from('user_telegram_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_verified', true);
      
    if (accountsError) {
      logger.error({ error: accountsError.message, user_id: user.id }, 'Error fetching Telegram accounts');
      return NextResponse.json({ 
        error: 'Error fetching Telegram accounts',
        details: accountsError
      }, { status: 500 });
    }
    
    if (!telegramAccounts || telegramAccounts.length === 0) {
      logger.info({ user_id: user.id }, 'No verified Telegram accounts found');
      return NextResponse.json({ 
        error: 'No verified Telegram accounts found for this user' 
      }, { status: 400 });
    }
    
    // Ищем аккаунт для текущей организации
    const telegramAccount = telegramAccounts.find(account => account.org_id === orgId);
    
    // Выбираем аккаунт для текущей организации или первый доступный
    const activeAccount = telegramAccount || telegramAccounts[0];
    
    logger.debug({ telegram_user_id: activeAccount.telegram_user_id, org_id: activeAccount.org_id }, 'Using Telegram account');
    
    // Проверяем права администратора
    const { data: adminRights, error: adminError } = await supabaseService
      .from('telegram_group_admins')
      .select('*')
      .eq('tg_chat_id', tgChatIdStr)
      .eq('tg_user_id', activeAccount.telegram_user_id)
      .eq('is_admin', true)
      .single();

    if (adminError || !adminRights || !adminRights.is_admin) {
      await logErrorToDatabase({
        level: 'warn',
        message: 'User is not admin in Telegram group',
        errorCode: 'TG_BOT_NOT_ADMIN',
        context: {
          endpoint: '/api/telegram/groups/add-to-org',
          reason: 'user_not_admin',
          groupId,
          tgChatId: tgChatIdStr,
          telegramUserId: activeAccount.telegram_user_id
        },
        userId: user.id,
        orgId
      });
      return NextResponse.json({
        error: 'Grant admin permissions to @orbo_community_bot before adding the group'
      }, { status: 400 });
    }

    if (adminRights.bot_status !== 'connected' && group.bot_status !== 'connected') {
      await logErrorToDatabase({
        level: 'warn',
        message: 'Bot not connected to Telegram group',
        errorCode: 'TG_BOT_NOT_ADMIN',
        context: {
          endpoint: '/api/telegram/groups/add-to-org',
          reason: 'bot_not_connected',
          groupId,
          tgChatId: tgChatIdStr,
          botStatus: adminRights.bot_status
        },
        userId: user.id,
        orgId
      });
      return NextResponse.json({
        error: 'Grant admin permissions to @orbo_community_bot before adding the group'
      }, { status: 400 });
    }

    logger.debug({ org_id: orgId, tg_chat_id: tgChatIdStr }, 'Checking existing mapping');

    // Проверяем существование записи (без `status`, так как этот столбец может не существовать)
    const { data: existingMapping, error: mappingCheckError } = await supabaseService
      .from('org_telegram_groups')
      .select('org_id, tg_chat_id, created_at')
      .eq('org_id', orgId)
      .eq('tg_chat_id', tgChatIdStr)
      .maybeSingle();

    if (mappingCheckError) {
      logger.error({ 
        code: mappingCheckError.code,
        error: mappingCheckError.message,
        tg_chat_id: tgChatIdStr,
        tg_chat_id_type: typeof tgChatIdStr
      }, 'Error checking group mapping');
      
      // Код 42P01 означает, что таблица не существует - это нормально для старых установок
      if (mappingCheckError.code !== '42P01') {
        return NextResponse.json({ 
          error: 'Failed to check existing group mapping',
          details: mappingCheckError.message 
        }, { status: 500 });
      }
      
      logger.warn({}, 'org_telegram_groups table not found, will use legacy fallback');
    }

    try {
      if (existingMapping) {
        logger.info({ tg_chat_id: tgChatIdStr, org_id: orgId, created_at: existingMapping.created_at }, 'Mapping already exists');
        // Группа уже добавлена - возвращаем успех
        // ✅ Добавляем флаг suggestImport даже для уже добавленных групп
        return NextResponse.json({
          success: true,
          message: 'Group already linked to this organization',
          groupId: group.id,
          tgChatId: tgChatIdStr,
          suggestImport: true // ✅ Флаг для показа предложения импорта истории
        });
      } else {
        logger.info({ tg_chat_id: tgChatIdStr, org_id: orgId }, 'Creating new mapping');
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
        logger.error({}, 'Mapping table org_telegram_groups not found - database schema issue');
        return NextResponse.json({ error: 'Database schema error: org_telegram_groups table missing' }, { status: 500 });
      } else {
        logger.error({ error: linkError.message || String(linkError) }, 'Error creating group mapping');
        return NextResponse.json({ 
          error: 'Failed to link group to organization',
          details: linkError.message || String(linkError)
        }, { status: 500 });
      }
    }

    logger.info({ tg_chat_id: tgChatIdStr, org_id: orgId }, 'Successfully linked group to org');

    // Копируем участников группы в новую организацию
    await copyGroupParticipantsToOrg(supabaseService, tgChatIdStr, orgId, logger);

    // Log admin action
    await logAdminAction({
      orgId,
      userId: user.id,
      action: AdminActions.ADD_TELEGRAM_GROUP,
      resourceType: ResourceTypes.TELEGRAM_GROUP,
      resourceId: group.id,
      metadata: {
        group_title: group.title,
        tg_chat_id: tgChatIdStr
      }
    });

    // ✅ Добавляем флаг suggestImport для показа предложения импорта истории
    return NextResponse.json({
      success: true,
      message: 'Group linked to organization',
      groupId: group.id,
      tgChatId: tgChatIdStr,
      suggestImport: true // ✅ Флаг для показа предложения импорта истории
    });
  } catch (error: any) {
    await logErrorToDatabase({
      level: 'error',
      message: error.message || 'Unknown error adding group to organization',
      errorCode: 'TG_GROUP_ADD_ERROR',
      context: {
        endpoint: '/api/telegram/groups/add-to-org',
        errorType: error.constructor?.name || typeof error
      },
      stackTrace: error.stack
    });
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

