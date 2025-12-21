import { NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const logger = createAPILogger(request, { endpoint: '/api/telegram/groups/clone-to-org' });
  let groupId: string | number | undefined;
  let orgId: string | undefined;
  try {
    const body = await request.json();
    groupId = body.groupId;
    orgId = body.orgId;
    
    if (!groupId || !orgId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }
    
    // Получаем текущего пользователя через unified auth
    const user = await getUnifiedUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    logger.info({ group_id: groupId, org_id: orgId, user_id: user.id }, 'Cloning group to org');
    
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
      logger.error({ error: membershipError?.message, user_id: user.id, org_id: orgId }, 'Error checking membership');
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
      logger.error({ error: groupError?.message, group_id: groupId }, 'Error fetching group');
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
      .eq('tg_chat_id', group.tg_chat_id)
      .eq('tg_user_id', activeAccount.telegram_user_id)
      .eq('is_admin', true)
      .single();
      
    if (adminError || !adminRights) {
      logger.error({ error: adminError?.message, tg_chat_id: group.tg_chat_id, tg_user_id: activeAccount.telegram_user_id }, 'Error checking admin rights');
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
      logger.info({ tg_chat_id: group.tg_chat_id, org_id: orgId }, 'Mapping already exists');
      return NextResponse.json({
        success: true,
        message: 'Group already linked to this organization'
      });
    }
    
    // Создаем связь организация ↔ группа без дублирования записи самой группы
    logger.info({ tg_chat_id: group.tg_chat_id, org_id: orgId }, 'Linking group to org');
    try {
      const { error: linkError } = await supabaseService
        .from('org_telegram_groups')
        .insert({
          org_id: orgId,
          tg_chat_id: group.tg_chat_id,
          created_by: user.id
        });
      
      if (linkError) {
        if (linkError.code === '42P01') {
          logger.error({}, 'Mapping table org_telegram_groups not found - database schema issue');
          return NextResponse.json({
            error: 'Database schema error: org_telegram_groups table missing',
            details: linkError
          }, { status: 500 });
        } else if (linkError.code === '23505') {
          logger.info({ tg_chat_id: group.tg_chat_id, org_id: orgId }, 'Mapping already exists, returning success');
        } else {
          logger.error({ error: linkError.message, tg_chat_id: group.tg_chat_id, org_id: orgId }, 'Error linking group to org');
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
        logger.error({}, 'Mapping table org_telegram_groups not found - database schema issue');
        return NextResponse.json({
          error: 'Database schema error: org_telegram_groups table missing',
          details: linkEx instanceof Error ? linkEx.message : String(linkEx)
        }, { status: 500 });
      }
      logger.error({ 
        error: linkEx instanceof Error ? linkEx.message : String(linkEx),
        stack: linkEx instanceof Error ? linkEx.stack : undefined,
        tg_chat_id: group.tg_chat_id,
        org_id: orgId
      }, 'Exception during linking');
      return NextResponse.json({
        error: 'Exception during linking',
        details: linkEx instanceof Error ? linkEx.message : String(linkEx)
      }, { status: 500 });
    }
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      group_id: groupId,
      org_id: orgId
    }, 'Error in clone-to-org');
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
