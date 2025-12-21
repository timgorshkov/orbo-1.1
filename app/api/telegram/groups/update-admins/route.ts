import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TelegramService } from '@/lib/services/telegramService';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const logger = createAPILogger(request, { endpoint: '/api/telegram/groups/update-admins' });
  try {
    const body = await request.json();
    const { orgId } = body;
    
    if (!orgId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }
    
    logger.info({ org_id: orgId }, 'Updating admin rights for org');
    
    const user = await getUnifiedUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Используем сервисную роль для обхода RLS политик
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
    }
    
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);
    
    // Получаем верифицированные аккаунты текущего пользователя (не ограничиваем по org_id)
    logger.debug({ user_id: user.id }, 'Fetching verified Telegram accounts');
    const { data: accounts, error: accountsError } = await supabaseService
      .from('user_telegram_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_verified', true);
      
    if (accountsError) {
      logger.error({ error: accountsError.message, user_id: user.id }, 'Error fetching verified accounts');
      return NextResponse.json({ 
        error: 'Failed to fetch verified accounts',
        details: accountsError
      }, { status: 500 });
    }
    
    if (!accounts || accounts.length === 0) {
      logger.info({ user_id: user.id }, 'No verified Telegram accounts found');
      return NextResponse.json({ 
        message: 'No verified Telegram accounts found for this user',
        updated: 0,
        total: 0
      });
    }
    
    logger.debug({ 
      accounts_count: accounts.length,
      user_id: user.id,
      accounts: accounts.map(a => ({ id: a.id, telegram_user_id: a.telegram_user_id, org_id: a.org_id }))
    }, 'Found verified accounts');
    
    // Получаем все группы для организации через org_telegram_groups
    logger.debug({ org_id: orgId }, 'Fetching groups for org');
    const { data: orgGroups, error: orgGroupsError } = await supabaseService
      .from('org_telegram_groups')
      .select(`
        tg_chat_id,
        telegram_groups!inner(*)
      `)
      .eq('org_id', orgId);
    
    if (orgGroupsError) {
      logger.error({ error: orgGroupsError.message, org_id: orgId }, 'Error fetching org groups');
      return NextResponse.json({ 
        error: 'Failed to fetch groups',
        details: orgGroupsError
      }, { status: 500 });
    }
    
    const groups = orgGroups?.map((og: any) => ({
      ...og.telegram_groups,
      tg_chat_id: og.tg_chat_id
    })) || [];
    
    // Note: No fallback to direct telegram_groups query - org_id column doesn't exist
    // All groups must be linked via org_telegram_groups table
    
    if (groups.length === 0) {
      logger.info({ org_id: orgId }, 'No Telegram groups found for org');
      return NextResponse.json({ 
        message: 'No Telegram groups found for this organization',
        updated: 0,
        total: 0
      });
    }
    
    logger.debug({ 
      groups_count: groups.length,
      org_id: orgId,
      groups: groups.map(g => ({ id: g.id, title: g.title, tg_chat_id: g.tg_chat_id }))
    }, 'Found groups for org');
    
    // Инициализируем Telegram сервис
    const telegramService = new TelegramService('main');
    
    // Получаем ВСЕХ администраторов для каждой группы
    let updatedCount = 0;
    const results = [];
    
    for (const group of groups) {
      try {
        logger.debug({ tg_chat_id: group.tg_chat_id, title: group.title }, 'Fetching all administrators for group');
        
        // Получаем ВСЕХ администраторов группы
        const adminsResponse = await telegramService.getChatAdministrators(Number(group.tg_chat_id));
        
        if (!adminsResponse.ok) {
          logger.error({ tg_chat_id: group.tg_chat_id, error: adminsResponse.description }, 'Failed to get administrators');
          results.push({
            group_id: group.id,
            status: 'error',
            message: adminsResponse.description || 'Failed to get administrators'
          });
          continue;
        }
        
        const administrators = adminsResponse.result || [];
        logger.debug({ tg_chat_id: group.tg_chat_id, admins_count: administrators.length, title: group.title }, 'Found administrators in group');
        
        // ✅ КРИТИЧЕСКИЙ ФИКС: Сначала деактивируем ВСЕХ админов этой группы
        // Это гарантирует, что если кого-то убрали из админов, его права будут отозваны
        logger.debug({ tg_chat_id: group.tg_chat_id }, '[DEACTIVATE] Starting deactivation');
        
        // Сначала проверим, сколько записей существует
        const { data: existingAdmins, error: countError } = await supabaseService
          .from('telegram_group_admins')
          .select('tg_user_id, is_admin')
          .eq('tg_chat_id', Number(group.tg_chat_id));
        
        if (countError) {
          logger.error({ tg_chat_id: group.tg_chat_id, error: countError.message }, '[DEACTIVATE] Error counting admins');
        } else {
          logger.debug({ 
            tg_chat_id: group.tg_chat_id,
            existing_admins_count: existingAdmins?.length || 0,
            existing_admins: existingAdmins?.map((a: any) => ({ tg_user_id: a.tg_user_id, is_admin: a.is_admin }))
          }, '[DEACTIVATE] Found existing admin records');
        }
        
        const { data: deactivatedData, error: deactivateError } = await supabaseService
          .from('telegram_group_admins')
          .update({ 
            is_admin: false, 
            is_owner: false,
            verified_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 1000).toISOString() // Истекает немедленно
          })
          .eq('tg_chat_id', Number(group.tg_chat_id))
          .select('tg_user_id');
        
        if (deactivateError) {
          logger.error({ tg_chat_id: group.tg_chat_id, error: deactivateError.message }, '[DEACTIVATE] ERROR deactivating admins');
        } else {
          logger.debug({ 
            tg_chat_id: group.tg_chat_id,
            deactivated_count: deactivatedData?.length || 0,
            deactivated_user_ids: deactivatedData?.map((a: any) => a.tg_user_id)
          }, '[DEACTIVATE] Successfully deactivated admins');
        }
        
        // Обрабатываем каждого администратора
        for (const admin of administrators) {
          const memberStatus = admin?.status;
          const isAdmin = memberStatus === 'administrator' || memberStatus === 'creator';
          const isOwner = memberStatus === 'creator';
          const userId = admin?.user?.id;
          
          if (!userId) {
            logger.warn({ tg_chat_id: group.tg_chat_id }, 'Administrator without user ID, skipping');
            continue;
          }
          
          // Обновляем или создаем запись в telegram_group_admins
          const { error: adminError } = await supabaseService
            .from('telegram_group_admins')
            .upsert({
              tg_chat_id: Number(group.tg_chat_id),
              tg_user_id: userId,
              is_owner: isOwner,
              is_admin: isAdmin,
              custom_title: admin.custom_title || null,
              can_manage_chat: admin.can_manage_chat || false,
              can_delete_messages: admin.can_delete_messages || false,
              can_manage_video_chats: admin.can_manage_video_chats || false,
              can_restrict_members: admin.can_restrict_members || false,
              can_promote_members: admin.can_promote_members || false,
              can_change_info: admin.can_change_info || false,
              can_invite_users: admin.can_invite_users || false,
              can_pin_messages: admin.can_pin_messages || false,
              can_post_messages: admin.can_post_messages || false,
              can_edit_messages: admin.can_edit_messages || false,
              verified_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 дней
            }, {
              onConflict: 'tg_chat_id,tg_user_id'
            });
            
          if (adminError) {
            logger.error({ tg_user_id: userId, tg_chat_id: group.tg_chat_id, error: adminError.message }, 'Error updating admin rights');
            results.push({
              group_id: group.id,
              user_id: userId,
              status: 'error',
              message: adminError.message || 'Failed to update admin rights'
            });
            continue;
          }
          
          updatedCount++;
          results.push({
            group_id: group.id,
            user_id: userId,
            status: 'success',
            is_owner: isOwner,
            is_admin: isAdmin,
            username: admin.user?.username || null
          });
          
          logger.debug({ 
            tg_user_id: userId,
            username: admin.user?.username || admin.user?.first_name,
            tg_chat_id: group.tg_chat_id,
            title: group.title
          }, 'Saved admin');
        }
        
        // Обновляем verified_by_user_id в telegram_groups, если не установлено
        if (!group.verified_by_user_id && accounts.length > 0) {
          const { error: updateError } = await supabaseService
            .from('telegram_groups')
            .update({
              // Legacy verification fields removed in migration 080
              // bot_status is updated automatically via my_chat_member webhook
              last_sync_at: new Date().toISOString()
            })
            .eq('id', group.id);
            
          if (updateError) {
            logger.error({ group_id: group.id, error: updateError.message }, 'Error updating group verification');
          }
        }
      } catch (error: any) {
        logger.error({ 
          tg_chat_id: group.tg_chat_id,
          error: error.message || String(error),
          stack: error.stack
        }, 'Error processing group');
        results.push({
          group_id: group.id,
          status: 'error',
          message: error.message || 'Unknown error'
        });
      }
    }
    
    // Вызываем функцию синхронизации админов для создания/обновления memberships
    logger.debug({ org_id: orgId }, 'Calling sync_telegram_admins');
    const { data: syncResult, error: syncError } = await supabaseService
      .rpc('sync_telegram_admins', { p_org_id: orgId });
    
    if (syncError) {
      logger.error({ error: syncError.message, org_id: orgId }, 'Error syncing telegram admins');
    } else {
      logger.debug({ org_id: orgId, sync_result: syncResult }, 'Sync result');
    }
    
    return NextResponse.json({
      success: true,
      message: `Updated admin rights for ${updatedCount} administrators across ${groups.length} groups`,
      updated: updatedCount,
      total: updatedCount,
      syncResult: syncResult || null,
      results
    });
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Error in update-admins');
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
