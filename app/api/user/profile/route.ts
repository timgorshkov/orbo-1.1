import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/user/profile?orgId=xxx
 * Получает полные данные профиля пользователя в контексте организации:
 * - Данные пользователя из auth.users (email, metadata)
 * - Membership в организации (роль, права)
 * - Telegram аккаунт для организации
 * - Профиль участника (если есть)
 */
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: 'user/profile' });
  
  try {
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('orgId');

    if (!orgId) {
      return NextResponse.json({ error: 'Missing orgId parameter' }, { status: 400 });
    }

    // Check auth via unified auth
    const user = await getUnifiedUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    logger.debug({ 
      user_id: user.id,
      org_id: orgId,
      email: user.email
    }, 'Profile request start');

    // Используем admin client для полного доступа
    const adminSupabase = createAdminServer();

    // 1. Данные пользователя из auth
    // Для OAuth и email пользователей email считается подтверждённым
    const authUser = {
      id: user.id,
      email: user.email,
      email_confirmed: true,  // All auth methods verify email
      email_confirmed_at: new Date().toISOString(),
      metadata: user.raw?.nextauth || {},
      created_at: user.raw?.nextauth?.createdAt || new Date().toISOString()
    };

    // ⚡ ОПТИМИЗАЦИЯ: Выполняем запросы параллельно
    const { getEffectiveOrgRole } = await import('@/lib/server/orgAccess')
    const [access, membershipResult, telegramResult, organizationResult] = await Promise.all([
      // Check access (with superadmin fallback)
      getEffectiveOrgRole(user.id, orgId),
      
      // 2. Membership в организации (may be null for superadmins)
      adminSupabase
        .from('memberships')
        .select('role, role_source, metadata, created_at')
        .eq('org_id', orgId)
        .eq('user_id', user.id)
        .maybeSingle(),
      
      // 3. Telegram аккаунт для организации
      adminSupabase
        .from('user_telegram_accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('org_id', orgId)
        .maybeSingle(),
      
      // 6. Информация об организации (перенесено сюда для параллельности)
      adminSupabase
        .from('organizations')
        .select('id, name, logo_url')
        .eq('id', orgId)
        .single()
    ]);

    if (!access) {
      return NextResponse.json({ 
        error: 'Forbidden', 
        details: 'You are not a member of this organization' 
      }, { status: 403 });
    }

    const membership = membershipResult.data;
    const { data: telegramAccount, error: telegramError } = telegramResult;
    const { data: organization } = organizationResult;

    // Проверяем, является ли пользователь теневым админом
    const isShadowProfile = membership?.metadata?.shadow_profile === true;

    if (telegramError) {
      logger.warn({ 
        user_id: user.id,
        org_id: orgId,
        error: telegramError.message
      }, 'Error fetching telegram account');
    }
    
    logger.debug({ 
      has_telegram_account: !!telegramAccount,
      telegram_user_id: telegramAccount?.telegram_user_id,
      is_verified: telegramAccount?.is_verified
    }, 'Initial queries complete');

    // 4. Профиль участника (если есть)
    let participant = null;
    
    // Сначала пробуем найти по telegram_user_id (если есть привязанный Telegram)
    if (telegramAccount?.telegram_user_id) {
      logger.debug({ 
        org_id: orgId,
        tg_user_id: telegramAccount.telegram_user_id
      }, 'Looking for participant by tg_user_id');
      
      const { data: participantData, error: participantError } = await adminSupabase
        .from('participants')
        .select('id, full_name, first_name, last_name, username, bio, photo_url, email, phone, custom_attributes, tg_user_id, participant_status, source, last_activity_at')
        .eq('org_id', orgId)
        .eq('tg_user_id', telegramAccount.telegram_user_id)
        .is('merged_into', null)
        .maybeSingle();
      
      if (participantError) {
        logger.error({ 
          org_id: orgId,
          tg_user_id: telegramAccount.telegram_user_id,
          error: participantError.message
        }, 'Error fetching participant by tg_user_id');
      } else {
        logger.debug({ 
          found: !!participantData,
          participant_id: participantData?.id,
          full_name: participantData?.full_name
        }, 'Participant lookup by tg_user_id');
      }
      
      participant = participantData;
    } else {
      logger.debug({}, 'Skipping tg_user_id lookup (no telegram account)');
    }
    
    // Если не нашли по telegram_user_id, пробуем найти по user_id (для shadow профилей)
    if (!participant) {
      logger.debug({ 
        org_id: orgId,
        user_id: user.id
      }, 'Looking for participant by user_id');
      
      const { data: participantData, error: participantError } = await adminSupabase
        .from('participants')
        .select('id, full_name, first_name, last_name, username, bio, photo_url, email, phone, custom_attributes, tg_user_id, participant_status, source, last_activity_at')
        .eq('org_id', orgId)
        .eq('user_id', user.id)
        .is('merged_into', null)
        .maybeSingle();
      
      if (participantError) {
        logger.error({ 
          org_id: orgId,
          user_id: user.id,
          error: participantError.message
        }, 'Error fetching participant by user_id');
      } else {
        logger.debug({ 
          found: !!participantData,
          participant_id: participantData?.id,
          full_name: participantData?.full_name
        }, 'Participant lookup by user_id');
      }
      
      participant = participantData;
    }

    // 4b. Если participant не найден, создаём его автоматически (для владельцев и админов)
    if (!participant && (access.role === 'owner' || access.role === 'admin') && !access.isSuperadmin) {
      logger.debug({ user_id: user.id, org_id: orgId }, 'Participant not found, creating new participant');
      
      // Определяем данные для создания participant
      const tgUserId = telegramAccount?.telegram_user_id || null;
      const username = telegramAccount?.telegram_username || null;
      const firstName = telegramAccount?.telegram_first_name || null;
      const lastName = telegramAccount?.telegram_last_name || null;
      const fullName = [firstName, lastName].filter(Boolean).join(' ') || authUser.email || 'Пользователь';
      
      try {
        const { data: newParticipant, error: createError } = await adminSupabase
          .from('participants')
          .insert({
            org_id: orgId,
            user_id: user.id,
            tg_user_id: tgUserId,
            username: username,
            first_name: firstName,
            last_name: lastName,
            full_name: fullName,
            source: telegramAccount ? 'telegram_admin' : 'manual',
            participant_status: 'participant' // Valid enum values: participant, event_attendee, candidate, excluded
          })
          .select('id, full_name, first_name, last_name, username, bio, photo_url, email, phone, custom_attributes, tg_user_id, participant_status, source, last_activity_at')
          .single();
        
        if (createError) {
          logger.error({ 
            user_id: user.id,
            org_id: orgId,
            error: createError.message
          }, 'Error creating participant');
        } else {
          logger.info({ 
            participant_id: newParticipant?.id,
            user_id: user.id,
            org_id: orgId
          }, 'Successfully created participant');
          participant = newParticipant;
        }
      } catch (createErr: any) {
        logger.error({ 
          user_id: user.id,
          org_id: orgId,
          error: createErr instanceof Error ? createErr.message : String(createErr)
        }, 'Exception creating participant');
      }
    }

    // 5. Если админ - получаем список групп, где он администратор
    let adminGroups: Array<{ id: number; title: string }> = [];
    if (membership?.role === 'admin' && membership?.role_source === 'telegram_admin') {
      try {
        const groupIds = membership.metadata?.telegram_groups || [];
        const groupTitles = membership.metadata?.telegram_group_titles || [];
        
        adminGroups = groupIds.map((id: number, index: number) => ({
          id,
          title: groupTitles[index] || `Group ${id}`
        }));
      } catch (e) {
        logger.error({ 
          user_id: user.id,
          error: e instanceof Error ? e.message : String(e)
        }, 'Error parsing admin groups');
      }
    }

    // 6. Информация об организации - уже получена в параллельном запросе выше

    const profile = {
      user: authUser,
      membership: {
        role: access.role,
        role_source: membership?.role_source || (access.isSuperadmin ? 'superadmin' : null),
        is_shadow_profile: isShadowProfile,
        created_at: membership?.created_at || null,
        admin_groups: adminGroups,
        metadata: membership?.metadata || null,
        is_superadmin: access.isSuperadmin
      },
      telegram: telegramAccount || null,
      participant: participant || null,
      organization: organization || null
    };

    logger.debug({ 
      user_id: user.id,
      org_id: orgId,
      is_shadow_profile: isShadowProfile,
      has_telegram_account: !!telegramAccount,
      has_participant: !!participant,
      participant_id: participant?.id,
      participant_name: participant?.full_name
    }, 'Profile request complete');

    return NextResponse.json({
      success: true,
      profile
    });

  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Profile API error');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/user/profile?orgId=xxx
 * Обновляет данные профиля участника
 */
export async function PATCH(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: 'user/profile' });
  
  try {
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('orgId');

    if (!orgId) {
      return NextResponse.json({ error: 'Missing orgId parameter' }, { status: 400 });
    }

    // Check auth via unified auth
    const user = await getUnifiedUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { full_name, bio, phone, custom_attributes } = body;

    logger.info({ user_id: user.id, org_id: orgId }, 'Updating profile');

    const adminSupabase = createAdminServer();

    // Проверяем membership (с фолбэком на суперадмина)
    const { getEffectiveOrgRole } = await import('@/lib/server/orgAccess')
    const access = await getEffectiveOrgRole(user.id, orgId);

    if (!access) {
      return NextResponse.json({ 
        error: 'Forbidden', 
        details: 'You are not a member of this organization' 
      }, { status: 403 });
    }

    // Для суперадминов - получаем реальный membership для проверки metadata
    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role, metadata')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle();

    // Проверяем, не теневой ли профиль (теневые не могут редактировать)
    if (membership?.metadata?.shadow_profile === true) {
      return NextResponse.json({ 
        error: 'Forbidden', 
        details: 'Shadow profiles cannot edit their profile. Please add and verify your email first.' 
      }, { status: 403 });
    }

    // Находим participant для обновления
    // Сначала пробуем найти по Telegram аккаунту
    const { data: telegramAccount } = await adminSupabase
      .from('user_telegram_accounts')
      .select('telegram_user_id')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .maybeSingle();

    // Ищем participant либо по tg_user_id, либо по user_id
    let participantQuery = adminSupabase
      .from('participants')
      .select('id')
      .eq('org_id', orgId)
      .is('merged_into', null);

    if (telegramAccount?.telegram_user_id) {
      participantQuery = participantQuery.eq('tg_user_id', telegramAccount.telegram_user_id);
    } else {
      participantQuery = participantQuery.eq('user_id', user.id);
    }

    const { data: existingParticipant } = await participantQuery.maybeSingle();

    if (!existingParticipant) {
      return NextResponse.json({ 
        error: 'Bad Request', 
        details: 'No participant profile found for this user.' 
      }, { status: 400 });
    }

    // Обновляем participant
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (full_name !== undefined) updateData.full_name = full_name;
    if (bio !== undefined) updateData.bio = bio;
    if (phone !== undefined) updateData.phone = phone;
    if (custom_attributes !== undefined) updateData.custom_attributes = custom_attributes;

    const { data: participant, error: updateError } = await adminSupabase
      .from('participants')
      .update(updateData)
      .eq('id', existingParticipant.id)
      .select()
      .single();

    if (updateError) {
      logger.error({ 
        user_id: user.id,
        org_id: orgId,
        participant_id: existingParticipant.id,
        error: updateError.message
      }, 'Update error');
      return NextResponse.json({ 
        error: 'Failed to update profile', 
        details: updateError.message 
      }, { status: 500 });
    }

    logger.info({ 
      user_id: user.id,
      org_id: orgId,
      participant_id: participant?.id
    }, 'Profile updated successfully');

    return NextResponse.json({
      success: true,
      participant
    });

  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Profile API error');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

