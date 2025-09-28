import { NextResponse } from 'next/server';
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { groupId, orgId } = body;
    
    if (!groupId || !orgId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }
    
    // Получаем текущего пользователя
    const supabase = createClientServer();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    console.log(`Cloning group ${groupId} to org ${orgId} by user ${user.id}`);
    
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
    
    // Проверяем, что группа существует
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
      .eq('tg_chat_id', group.tg_chat_id)
      .eq('tg_user_id', activeAccount.telegram_user_id)
      .eq('is_admin', true)
      .single();
      
    if (adminError || !adminRights) {
      console.error('Error checking admin rights:', adminError);
      return NextResponse.json({ 
        error: 'You are not an admin of this group' 
      }, { status: 403 });
    }
    
    // Проверяем, существует ли уже привязка этой группы к данной организации
    const { data: existingMapping } = await supabaseService
      .from('org_telegram_groups')
      .select('*')
      .eq('tg_chat_id', group.tg_chat_id)
      .eq('org_id', orgId)
      .maybeSingle();
    
    if (existingMapping) {
      console.log(`Mapping for ${group.tg_chat_id} already exists in org ${orgId}`);
      return NextResponse.json({
        success: true,
        message: 'Group already linked to this organization'
      });
    }
    
    // Создаем связь организация ↔ группа без дублирования записи самой группы
    console.log(`Linking group ${group.tg_chat_id} to org ${orgId}`);
    try {
      const { error: linkError } = await supabaseService
        .from('org_telegram_groups')
        .insert({
          org_id: orgId,
          tg_chat_id: group.tg_chat_id,
          created_by: user.id
        });
      
      if (linkError) {
        // Если таблицы нет - значит миграция не применена
        if (linkError.code === '42P01') {
          console.warn('Mapping table org_telegram_groups not found, falling back to direct update');
          const { error: updateError } = await supabaseService
            .from('telegram_groups')
            .update({ org_id: orgId })
            .eq('id', group.id);
          if (updateError) {
            console.error('Fallback update failed:', updateError);
            return NextResponse.json({
              error: 'Failed to link group to organization',
              details: updateError
            }, { status: 500 });
          }
        } else if (linkError.code === '23505') {
          console.log('Mapping already exists, returning success');
        } else {
          console.error('Error linking group to org:', linkError);
          return NextResponse.json({
            error: 'Failed to link group to organization',
            details: linkError
          }, { status: 500 });
        }
      }
      
      return NextResponse.json({
        success: true,
        message: 'Group linked to organization'
      });
    } catch (linkEx: any) {
      if (linkEx.code === '42P01') {
        console.warn('Mapping table missing during exception; falling back');
        const { error: updateError } = await supabaseService
          .from('telegram_groups')
          .update({ org_id: orgId })
          .eq('id', group.id);
        if (updateError) {
          console.error('Fallback update failed:', updateError);
          return NextResponse.json({
            error: 'Failed to link group to organization',
            details: updateError
          }, { status: 500 });
        }
        return NextResponse.json({
          success: true,
          message: 'Group linked to organization'
        });
      }
      console.error('Exception during linking:', linkEx);
      return NextResponse.json({
        error: 'Exception during linking',
        details: linkEx instanceof Error ? linkEx.message : String(linkEx)
      }, { status: 500 });
    }
    console.log(`Successfully cloned group ${groupId} to org ${orgId}`);
  } catch (error: any) {
    console.error('Error in clone-to-org:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
