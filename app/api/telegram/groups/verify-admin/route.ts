import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClientServer } from '@/lib/server/supabaseServer';
import { TelegramService } from '@/lib/services/telegramService';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { orgId, chatId } = body;

    if (!orgId || !chatId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const supabase = createClientServer();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Получаем верифицированный Telegram аккаунт пользователя для данной организации
    const { data: telegramAccount, error: accountError } = await supabase
      .from('user_telegram_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .eq('is_verified', true)
      .single();

    if (accountError || !telegramAccount) {
      return NextResponse.json({ 
        error: 'No verified Telegram account found for this organization' 
      }, { status: 400 });
    }

    // Инициализируем основной бот для проверки админских прав
    const telegramService = new TelegramService('main');

    try {
      // Получаем информацию о чате
      const chatInfo = await telegramService.getChat(chatId);
      
      if (!chatInfo.ok) {
        return NextResponse.json({ 
          error: 'Failed to get chat information',
          details: chatInfo
        }, { status: 400 });
      }

      // Проверяем админские права пользователя в группе
      const adminInfo = await telegramService.getChatMember(chatId, telegramAccount.telegram_user_id);
      
      if (!adminInfo.ok) {
        return NextResponse.json({ 
          error: 'Failed to get user admin status',
          details: adminInfo
        }, { status: 400 });
      }

      const member = adminInfo.result;
      const isAdmin = member.status === 'administrator' || member.status === 'creator';
      const isOwner = member.status === 'creator';

      if (!isAdmin) {
        return NextResponse.json({ 
          error: 'User is not an administrator of this group',
          userStatus: member.status
        }, { status: 403 });
      }

      // Используем сервисную роль для сохранения данных
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

      // Сохраняем или обновляем информацию об админских правах
      const { error: adminError } = await supabaseService
        .from('telegram_group_admins')
        .upsert({
          tg_chat_id: parseInt(chatId),
          tg_user_id: telegramAccount.telegram_user_id,
          user_telegram_account_id: telegramAccount.id,
          is_owner: isOwner,
          is_admin: isAdmin,
          can_manage_chat: member.can_manage_chat || false,
          can_delete_messages: member.can_delete_messages || false,
          can_manage_video_chats: member.can_manage_video_chats || false,
          can_restrict_members: member.can_restrict_members || false,
          can_promote_members: member.can_promote_members || false,
          can_change_info: member.can_change_info || false,
          can_invite_users: member.can_invite_users || false,
          can_pin_messages: member.can_pin_messages || false,
          verified_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 дней
        }, {
          onConflict: 'tg_chat_id,tg_user_id'
        });

      if (adminError) {
        console.error('Error saving admin info:', adminError);
      }

      // Проверяем, существует ли уже эта группа в организации
      const { data: existingGroup } = await supabaseService
        .from('telegram_groups')
        .select('*')
        .eq('tg_chat_id', parseInt(chatId))
        .eq('org_id', orgId)
        .single();

      let groupData = existingGroup;

      // Если группы нет, создаем её
      if (!existingGroup) {
        const { data: newGroup, error: groupError } = await supabaseService
          .from('telegram_groups')
          .insert({
            org_id: orgId,
            tg_chat_id: parseInt(chatId),
            title: chatInfo.result.title,
            invite_link: chatInfo.result.invite_link || null,
            bot_status: 'connected',
            verified_by_user_id: user.id,
            verification_status: 'verified',
            last_verification_at: new Date().toISOString(),
            member_count: chatInfo.result.member_count || 0,
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (groupError) {
          console.error('Error creating group:', groupError);
          return NextResponse.json({ 
            error: 'Failed to create group record' 
          }, { status: 500 });
        }

        groupData = newGroup;
      } else {
        // Обновляем существующую группу
        const { data: updatedGroup, error: updateError } = await supabaseService
          .from('telegram_groups')
          .update({
            title: chatInfo.result.title,
            invite_link: chatInfo.result.invite_link || null,
            verified_by_user_id: user.id,
            verification_status: 'verified',
            last_verification_at: new Date().toISOString(),
            member_count: chatInfo.result.member_count || 0
          })
          .eq('id', existingGroup.id)
          .select()
          .single();

        if (updateError) {
          console.error('Error updating group:', updateError);
        } else {
          groupData = updatedGroup;
        }
      }

      return NextResponse.json({
        success: true,
        group: groupData,
        adminInfo: {
          isOwner,
          isAdmin,
          status: member.status,
          permissions: {
            can_manage_chat: member.can_manage_chat || false,
            can_delete_messages: member.can_delete_messages || false,
            can_manage_video_chats: member.can_manage_video_chats || false,
            can_restrict_members: member.can_restrict_members || false,
            can_promote_members: member.can_promote_members || false,
            can_change_info: member.can_change_info || false,
            can_invite_users: member.can_invite_users || false,
            can_pin_messages: member.can_pin_messages || false
          }
        },
        message: 'Group verified and added successfully'
      });

    } catch (telegramError: any) {
      console.error('Telegram API error:', telegramError);
      return NextResponse.json({ 
        error: 'Failed to verify group admin status',
        details: telegramError.message
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error('Error in verify-admin:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
