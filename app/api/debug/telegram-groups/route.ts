import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClientServer } from '@/lib/server/supabaseServer';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    // Получаем параметры запроса
    const url = new URL(request.url);
    const orgId = url.searchParams.get('orgId');
    const telegramUserId = url.searchParams.get('telegramUserId');
    
    // Используем сервисную роль для обхода RLS политик
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
    }
    
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);
    
    // Получаем список всех групп
    const { data: allGroups, error: allGroupsError } = await supabaseService
      .from('telegram_groups')
      .select('*')
      .order('title');
      
    if (allGroupsError) {
      console.error('Error fetching all telegram groups:', allGroupsError);
      return NextResponse.json({ error: 'Failed to fetch telegram groups' }, { status: 500 });
    }
    
    // Если указан ID организации, получаем группы для этой организации
    let orgGroups = null;
    if (orgId) {
      const { data, error } = await supabaseService
        .from('telegram_groups')
        .select('*')
        .eq('org_id', orgId)
        .order('title');
        
      if (error) {
        console.error(`Error fetching groups for org ${orgId}:`, error);
      } else {
        orgGroups = data;
      }
    }
    
    // Если указан Telegram User ID, получаем группы, где пользователь админ
    let userGroups = null;
    if (telegramUserId) {
      const { data, error } = await supabaseService
        .from('telegram_group_admins')
        .select('*, telegram_groups(*)')
        .eq('tg_user_id', telegramUserId);
        
      if (error) {
        console.error(`Error fetching groups for user ${telegramUserId}:`, error);
      } else {
        userGroups = data;
      }
    }
    
    // Получаем информацию о верифицированных аккаунтах
    const { data: accounts, error: accountsError } = await supabaseService
      .from('user_telegram_accounts')
      .select('*')
      .eq('is_verified', true);
      
    if (accountsError) {
      console.error('Error fetching verified accounts:', accountsError);
    }
    
    // Получаем информацию о правах администраторов
    const { data: admins, error: adminsError } = await supabaseService
      .from('telegram_group_admins')
      .select('*');
      
    if (adminsError) {
      console.error('Error fetching admin rights:', adminsError);
    }
    
    return NextResponse.json({
      allGroups,
      orgGroups,
      userGroups,
      verifiedAccounts: accounts,
      adminRights: admins,
      params: {
        orgId,
        telegramUserId
      }
    });
  } catch (error: any) {
    console.error('Error in debug telegram groups:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
