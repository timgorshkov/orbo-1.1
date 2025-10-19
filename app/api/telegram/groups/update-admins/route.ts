import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClientServer } from '@/lib/server/supabaseServer';
import { TelegramService } from '@/lib/services/telegramService';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { orgId } = body;
    
    if (!orgId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }
    
    console.log(`Updating admin rights for org: ${orgId}`);
    
    const supabase = await createClientServer();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
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
    console.log(`Fetching verified Telegram accounts for user ${user.id}...`);
    const { data: accounts, error: accountsError } = await supabaseService
      .from('user_telegram_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_verified', true);
      
    if (accountsError) {
      console.error('Error fetching verified accounts:', accountsError);
      return NextResponse.json({ 
        error: 'Failed to fetch verified accounts',
        details: accountsError
      }, { status: 500 });
    }
    
    if (!accounts || accounts.length === 0) {
      console.log(`No verified Telegram accounts found for user ${user.id}`);
      return NextResponse.json({ 
        message: 'No verified Telegram accounts found for this user',
        updated: 0,
        total: 0
      });
    }
    
    console.log(`Found ${accounts.length} verified account(s) for user ${user.id}:`, accounts.map(a => ({ id: a.id, telegram_user_id: a.telegram_user_id, org_id: a.org_id })));
    
    // Получаем все группы для организации через org_telegram_groups
    console.log(`Fetching groups for org ${orgId}...`);
    const { data: orgGroups, error: orgGroupsError } = await supabaseService
      .from('org_telegram_groups')
      .select(`
        tg_chat_id,
        telegram_groups!inner(*)
      `)
      .eq('org_id', orgId);
    
    if (orgGroupsError) {
      console.error('Error fetching org groups:', orgGroupsError);
      return NextResponse.json({ 
        error: 'Failed to fetch groups',
        details: orgGroupsError
      }, { status: 500 });
    }
    
    const groups = orgGroups?.map((og: any) => ({
      ...og.telegram_groups,
      tg_chat_id: og.tg_chat_id
    })) || [];
    
    // Fallback: пытаемся получить группы напрямую из telegram_groups
    if (groups.length === 0) {
      console.log('No groups found via org_telegram_groups, trying direct query...');
      const { data: directGroups, error: groupsError } = await supabaseService
        .from('telegram_groups')
        .select('*')
        .eq('org_id', orgId);
      
      if (groupsError) {
        console.error('Error fetching groups:', groupsError);
        return NextResponse.json({ 
          error: 'Failed to fetch groups',
          details: groupsError
        }, { status: 500 });
      }
      
      if (directGroups && directGroups.length > 0) {
        groups.push(...directGroups);
      }
    }
    
    if (groups.length === 0) {
      console.log(`No Telegram groups found for org ${orgId}`);
      return NextResponse.json({ 
        message: 'No Telegram groups found for this organization',
        updated: 0,
        total: 0
      });
    }
    
    console.log(`Found ${groups.length} group(s) for org ${orgId}:`, groups.map(g => ({ id: g.id, title: g.title, tg_chat_id: g.tg_chat_id })));
    
    // Инициализируем Telegram сервис
    const telegramService = new TelegramService('main');
    
    // Для каждого аккаунта и группы проверяем права администратора
    let updatedCount = 0;
    const results = [];
    
    for (const account of accounts) {
      for (const group of groups) {
        try {
          console.log(`Checking admin rights for user ${account.telegram_user_id} in group ${group.tg_chat_id} (${group.title})`);
          
          // Проверяем права администратора
          const adminInfo = await telegramService.getChatMember(
            Number(group.tg_chat_id), 
            Number(account.telegram_user_id)
          );
          
          if (!adminInfo.ok) {
            console.error(`Failed to get admin info:`, adminInfo);
            results.push({
              account_id: account.id,
              group_id: group.id,
              status: 'error',
              message: adminInfo.description || 'Failed to get admin info'
            });
            continue;
          }
          
          const member = adminInfo.result;
          const isAdmin = member.status === 'administrator' || member.status === 'creator';
          const isOwner = member.status === 'creator';
          
          if (!isAdmin) {
            console.log(`User ${account.telegram_user_id} is not admin in group ${group.tg_chat_id} (${group.title})`);
            results.push({
              account_id: account.id,
              group_id: group.id,
              status: 'not_admin',
              message: `User is not admin (status: ${member.status})`
            });
            continue;
          }
          
          // Обновляем или создаем запись в telegram_group_admins
          const { error: adminError } = await supabaseService
            .from('telegram_group_admins')
            .upsert({
              tg_chat_id: Number(group.tg_chat_id),
              tg_user_id: Number(account.telegram_user_id),
              user_telegram_account_id: account.id,
              is_owner: isOwner,
              is_admin: isAdmin,
              custom_title: member.custom_title || null,
              can_manage_chat: member.can_manage_chat || false,
              can_delete_messages: member.can_delete_messages || false,
              can_manage_video_chats: member.can_manage_video_chats || false,
              can_restrict_members: member.can_restrict_members || false,
              can_promote_members: member.can_promote_members || false,
              can_change_info: member.can_change_info || false,
              can_invite_users: member.can_invite_users || false,
              can_pin_messages: member.can_pin_messages || false,
              can_post_messages: member.can_post_messages || false,
              can_edit_messages: member.can_edit_messages || false,
              verified_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 дней
            }, {
              onConflict: 'tg_chat_id,tg_user_id'
            });
            
          if (adminError) {
            console.error(`Error updating admin rights:`, adminError);
            results.push({
              account_id: account.id,
              group_id: group.id,
              status: 'error',
              message: adminError.message || 'Failed to update admin rights'
            });
            continue;
          }
          
          // Обновляем verified_by_user_id в telegram_groups, если не установлено
          if (!group.verified_by_user_id) {
            const { error: updateError } = await supabaseService
              .from('telegram_groups')
              .update({
                verified_by_user_id: account.user_id,
                verification_status: 'verified',
                last_verification_at: new Date().toISOString()
              })
              .eq('id', group.id);
              
            if (updateError) {
              console.error(`Error updating group verification:`, updateError);
            }
          }
          
          updatedCount++;
          results.push({
            account_id: account.id,
            group_id: group.id,
            status: 'success',
            is_owner: isOwner,
            is_admin: isAdmin
          });
          
          console.log(`Updated admin rights for user ${account.telegram_user_id} in group ${group.tg_chat_id} (${group.title})`);
        } catch (error: any) {
          console.error(`Error processing admin rights:`, error);
          results.push({
            account_id: account.id,
            group_id: group.id,
            status: 'error',
            message: error.message || 'Unknown error'
          });
        }
      }
    }
    
    // Вызываем функцию синхронизации админов для создания/обновления memberships
    console.log(`Calling sync_telegram_admins for org ${orgId}...`);
    const { data: syncResult, error: syncError } = await supabaseService
      .rpc('sync_telegram_admins', { p_org_id: orgId });
    
    if (syncError) {
      console.error('Error syncing telegram admins:', syncError);
    } else {
      console.log(`Sync result:`, syncResult);
    }
    
    return NextResponse.json({
      success: true,
      message: `Updated admin rights for ${updatedCount} user-group pairs`,
      updated: updatedCount,
      total: accounts.length * groups.length,
      syncResult: syncResult || null,
      results
    });
  } catch (error: any) {
    console.error('Error in update-admins:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
