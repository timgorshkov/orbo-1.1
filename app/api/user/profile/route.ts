import { NextRequest, NextResponse } from 'next/server';
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer';

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
  try {
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('orgId');

    if (!orgId) {
      return NextResponse.json({ error: 'Missing orgId parameter' }, { status: 400 });
    }

    const supabase = await createClientServer();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`[Profile API] Fetching profile for user ${user.id} in org ${orgId}`);

    // Используем admin client для полного доступа
    const adminSupabase = createAdminServer();

    // 1. Данные пользователя из auth
    const authUser = {
      id: user.id,
      email: user.email,
      email_confirmed: !!user.email_confirmed_at,
      email_confirmed_at: user.email_confirmed_at,
      metadata: user.user_metadata || {},
      created_at: user.created_at
    };

    // 2. Membership в организации
    const { data: membership, error: membershipError } = await adminSupabase
      .from('memberships')
      .select('role, role_source, metadata, created_at')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();

    if (membershipError) {
      console.error('[Profile API] Membership error:', membershipError);
      return NextResponse.json({ 
        error: 'Forbidden', 
        details: 'You are not a member of this organization' 
      }, { status: 403 });
    }

    // Проверяем, является ли пользователь теневым админом
    const isShadowProfile = membership.metadata?.shadow_profile === true;

    // 3. Telegram аккаунт для организации
    const { data: telegramAccount } = await adminSupabase
      .from('user_telegram_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .maybeSingle();

    // 4. Профиль участника (если есть)
    let participant = null;
    
    // Сначала пробуем найти по telegram_user_id (если есть привязанный Telegram)
    if (telegramAccount?.telegram_user_id) {
      const { data: participantData } = await adminSupabase
        .from('participants')
        .select('id, full_name, first_name, last_name, username, bio, photo_url, email, phone, custom_attributes, tg_user_id, tg_username, participant_status, source, last_activity_at')
        .eq('org_id', orgId)
        .eq('tg_user_id', telegramAccount.telegram_user_id)
        .is('merged_into', null)
        .maybeSingle();
      
      participant = participantData;
    }
    
    // Если не нашли по telegram_user_id, пробуем найти по user_id (для shadow профилей)
    if (!participant) {
      const { data: participantData } = await adminSupabase
        .from('participants')
        .select('id, full_name, first_name, last_name, username, bio, photo_url, email, phone, custom_attributes, tg_user_id, tg_username, participant_status, source, last_activity_at')
        .eq('org_id', orgId)
        .eq('user_id', user.id)
        .is('merged_into', null)
        .maybeSingle();
      
      participant = participantData;
    }

    // 5. Если админ - получаем список групп, где он администратор
    let adminGroups: Array<{ id: number; title: string }> = [];
    if (membership.role === 'admin' && membership.role_source === 'telegram_admin') {
      try {
        const groupIds = membership.metadata?.telegram_groups || [];
        const groupTitles = membership.metadata?.telegram_group_titles || [];
        
        adminGroups = groupIds.map((id: number, index: number) => ({
          id,
          title: groupTitles[index] || `Group ${id}`
        }));
      } catch (e) {
        console.error('[Profile API] Error parsing admin groups:', e);
      }
    }

    // 6. Информация об организации
    const { data: organization } = await adminSupabase
      .from('organizations')
      .select('id, name, logo_url')
      .eq('id', orgId)
      .single();

    const profile = {
      user: authUser,
      membership: {
        role: membership.role,
        role_source: membership.role_source,
        is_shadow_profile: isShadowProfile,
        created_at: membership.created_at,
        admin_groups: adminGroups,
        metadata: membership.metadata
      },
      telegram: telegramAccount || null,
      participant: participant || null,
      organization: organization || null
    };

    console.log(`[Profile API] Profile fetched successfully. Shadow: ${isShadowProfile}, Has Telegram: ${!!telegramAccount}, Has Participant: ${!!participant}`);

    return NextResponse.json({
      success: true,
      profile
    });

  } catch (error: any) {
    console.error('[Profile API] Error:', error);
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
  try {
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('orgId');

    if (!orgId) {
      return NextResponse.json({ error: 'Missing orgId parameter' }, { status: 400 });
    }

    const supabase = await createClientServer();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { full_name, bio, custom_attributes } = body;

    console.log(`[Profile API] Updating profile for user ${user.id} in org ${orgId}`);

    const adminSupabase = createAdminServer();

    // Проверяем membership
    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role, metadata')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ 
        error: 'Forbidden', 
        details: 'You are not a member of this organization' 
      }, { status: 403 });
    }

    // Проверяем, не теневой ли профиль (теневые не могут редактировать)
    if (membership.metadata?.shadow_profile === true) {
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
    if (custom_attributes !== undefined) updateData.custom_attributes = custom_attributes;

    const { data: participant, error: updateError } = await adminSupabase
      .from('participants')
      .update(updateData)
      .eq('id', existingParticipant.id)
      .select()
      .single();

    if (updateError) {
      console.error('[Profile API] Update error:', updateError);
      return NextResponse.json({ 
        error: 'Failed to update profile', 
        details: updateError.message 
      }, { status: 500 });
    }

    console.log(`[Profile API] Profile updated successfully`);

    return NextResponse.json({
      success: true,
      participant
    });

  } catch (error: any) {
    console.error('[Profile API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

