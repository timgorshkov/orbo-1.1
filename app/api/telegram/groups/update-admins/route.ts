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
    
    // Получаем ВСЕХ администраторов для каждой группы
    let updatedCount = 0;
    const results = [];
    
    for (const group of groups) {
      try {
        console.log(`Fetching all administrators for group ${group.tg_chat_id} (${group.title})`);
        
        // Получаем ВСЕХ администраторов группы
        const adminsResponse = await telegramService.getChatAdministrators(Number(group.tg_chat_id));
        
        if (!adminsResponse.ok) {
          console.error(`Failed to get administrators for group ${group.tg_chat_id}:`, adminsResponse.description);
          results.push({
            group_id: group.id,
            status: 'error',
            message: adminsResponse.description || 'Failed to get administrators'
          });
          continue;
        }
        
        const administrators = adminsResponse.result || [];
        console.log(`Found ${administrators.length} administrators in group ${group.tg_chat_id} (${group.title})`);
        
        // Обрабатываем каждого администратора
        for (const admin of administrators) {
          const memberStatus = admin?.status;
          const isAdmin = memberStatus === 'administrator' || memberStatus === 'creator';
          const isOwner = memberStatus === 'creator';
          const userId = admin?.user?.id;
          
          if (!userId) {
            console.warn(`Administrator without user ID in group ${group.tg_chat_id}, skipping`);
            continue;
          }
          
          // Обновляем или создаем запись в telegram_group_admins
          const { error: adminError } = await supabaseService
            .from('telegram_group_admins')
            .upsert({
              tg_chat_id: Number(group.tg_chat_id),
              tg_user_id: userId,
              user_telegram_account_id: null, // Будет заполнено через sync_telegram_admins
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
            console.error(`Error updating admin rights for user ${userId} in group ${group.tg_chat_id}:`, adminError);
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
          
          console.log(`✅ Saved admin ${userId} (${admin.user?.username || admin.user?.first_name}) for group ${group.tg_chat_id} (${group.title})`);
        }
        
        // Обновляем verified_by_user_id в telegram_groups, если не установлено
        if (!group.verified_by_user_id && accounts.length > 0) {
          const { error: updateError } = await supabaseService
            .from('telegram_groups')
            .update({
              verified_by_user_id: accounts[0].user_id,
              verification_status: 'verified',
              last_verification_at: new Date().toISOString()
            })
            .eq('id', group.id);
            
          if (updateError) {
            console.error(`Error updating group verification:`, updateError);
          }
        }
      } catch (error: any) {
        console.error(`Error processing group ${group.tg_chat_id}:`, error);
        results.push({
          group_id: group.id,
          status: 'error',
          message: error.message || 'Unknown error'
        });
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
      message: `Updated admin rights for ${updatedCount} administrators across ${groups.length} groups`,
      updated: updatedCount,
      total: updatedCount,
      syncResult: syncResult || null,
      results
    });
  } catch (error: any) {
    console.error('Error in update-admins:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
