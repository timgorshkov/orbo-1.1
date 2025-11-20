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

    console.log(`[Profile API] ========== PROFILE REQUEST START ==========`);
    console.log(`[Profile API] User ID: ${user.id}`);
    console.log(`[Profile API] Org ID: ${orgId}`);
    console.log(`[Profile API] Email: ${user.email}`);

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
    console.log(`[Profile API] Step 3: Looking for telegram account (user_id=${user.id}, org_id=${orgId})`);
    const { data: telegramAccount, error: telegramError } = await adminSupabase
      .from('user_telegram_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .maybeSingle();
    
    if (telegramError) {
      console.error('[Profile API] Error fetching telegram account:', telegramError);
    }
    
    console.log(`[Profile API] Telegram account found: ${!!telegramAccount}`);
    if (telegramAccount) {
      console.log(`[Profile API] Telegram account details:`, {
        id: telegramAccount.id,
        telegram_user_id: telegramAccount.telegram_user_id,
        telegram_username: telegramAccount.telegram_username,
        is_verified: telegramAccount.is_verified
      });
    }

    // 4. Профиль участника (если есть)
    let participant = null;
    
    // Сначала пробуем найти по telegram_user_id (если есть привязанный Telegram)
    if (telegramAccount?.telegram_user_id) {
      console.log(`[Profile API] Step 4a: Looking for participant by tg_user_id`);
      console.log(`[Profile API] Query params:`, {
        org_id: orgId,
        tg_user_id: telegramAccount.telegram_user_id,
        merged_into: 'IS NULL'
      });
      
      const { data: participantData, error: participantError } = await adminSupabase
        .from('participants')
        .select('id, full_name, first_name, last_name, username, bio, photo_url, email, phone_number, phone, custom_attributes, tg_user_id, participant_status, source, last_activity_at')
        .eq('org_id', orgId)
        .eq('tg_user_id', telegramAccount.telegram_user_id)
        .is('merged_into', null)
        .maybeSingle();
      
      if (participantError) {
        console.error('[Profile API] ❌ Error fetching participant by tg_user_id:', participantError);
      } else {
        console.log(`[Profile API] Participant found by tg_user_id: ${!!participantData}`);
        if (participantData) {
          console.log('[Profile API] ✅ Participant data:', {
            id: participantData.id,
            full_name: participantData.full_name,
            tg_user_id: participantData.tg_user_id,
            user_id: '(not selected but should match)'
          });
        } else {
          console.warn('[Profile API] ⚠️ No participant found with tg_user_id:', telegramAccount.telegram_user_id);
        }
      }
      
      participant = participantData;
    } else {
      console.log('[Profile API] Step 4a: Skipping tg_user_id lookup (no telegram account)');
    }
    
    // Если не нашли по telegram_user_id, пробуем найти по user_id (для shadow профилей)
    if (!participant) {
      console.log(`[Profile API] Step 4b: Looking for participant by user_id`);
      console.log(`[Profile API] Query params:`, {
        org_id: orgId,
        user_id: user.id,
        merged_into: 'IS NULL'
      });
      
      const { data: participantData, error: participantError } = await adminSupabase
        .from('participants')
        .select('id, full_name, first_name, last_name, username, bio, photo_url, email, phone_number, phone, custom_attributes, tg_user_id, participant_status, source, last_activity_at')
        .eq('org_id', orgId)
        .eq('user_id', user.id)
        .is('merged_into', null)
        .maybeSingle();
      
      if (participantError) {
        console.error('[Profile API] ❌ Error fetching participant by user_id:', participantError);
      } else {
        console.log(`[Profile API] Participant found by user_id: ${!!participantData}`);
        if (participantData) {
          console.log('[Profile API] ✅ Participant data:', {
            id: participantData.id,
            full_name: participantData.full_name,
            username: participantData.username,
            tg_user_id: participantData.tg_user_id
          });
        } else {
          console.warn('[Profile API] ⚠️ No participant found with user_id:', user.id);
        }
      }
      
      participant = participantData;
    }

    // 4b. Если participant не найден, создаём его автоматически (для владельцев и админов)
    if (!participant && (membership.role === 'owner' || membership.role === 'admin')) {
      console.log('[Profile API] Participant not found, creating new participant for user');
      
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
            participant_status: membership.role === 'owner' ? 'owner' : 'admin'
          })
          .select('id, full_name, first_name, last_name, username, bio, photo_url, email, phone_number, phone, custom_attributes, tg_user_id, participant_status, source, last_activity_at')
          .single();
        
        if (createError) {
          console.error('[Profile API] Error creating participant:', createError);
        } else {
          console.log('[Profile API] Successfully created participant:', newParticipant?.id);
          participant = newParticipant;
        }
      } catch (createErr: any) {
        console.error('[Profile API] Exception creating participant:', createErr);
      }
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

    console.log(`[Profile API] ========== PROFILE REQUEST COMPLETE ==========`);
    console.log(`[Profile API] Summary:`, {
      isShadowProfile,
      hasTelegramAccount: !!telegramAccount,
      hasParticipant: !!participant,
      participantId: participant?.id || 'null',
      participantName: participant?.full_name || 'null'
    });

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
    const { full_name, bio, phone_number, phone, custom_attributes } = body;

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
    // Support both phone_number and phone for backward compatibility
    if (phone_number !== undefined) updateData.phone_number = phone_number;
    else if (phone !== undefined) updateData.phone_number = phone;
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

