import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';

export const dynamic = 'force-dynamic';

/**
 * Debug endpoint для проверки Telegram аккаунта пользователя
 * Использование: GET /api/debug/check-telegram-user?telegramId=423400966
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const telegramIdParam = searchParams.get('telegramId');
    
    if (!telegramIdParam) {
      return NextResponse.json({ 
        error: 'Missing telegramId parameter',
        usage: '/api/debug/check-telegram-user?telegramId=423400966'
      }, { status: 400 });
    }
    
    const telegramId = Number(telegramIdParam);
    
    if (isNaN(telegramId)) {
      return NextResponse.json({ 
        error: 'Invalid telegramId - must be a number' 
      }, { status: 400 });
    }
    
    console.log(`[Debug] Checking Telegram user ${telegramId}`);
    
    const supabase = createAdminServer();
    
    // 1. Проверяем, есть ли аккаунт в user_telegram_accounts
    const { data: telegramAccounts, error: accountsError } = await supabase
      .from('user_telegram_accounts')
      .select('*')
      .eq('telegram_user_id', telegramId);
    
    if (accountsError) {
      return NextResponse.json({ 
        error: 'Database error',
        details: accountsError.message 
      }, { status: 500 });
    }
    
    // 2. Проверяем группы, где пользователь админ
    const { data: adminGroups, error: adminGroupsError } = await supabase
      .from('telegram_group_admins')
      .select(`
        tg_chat_id,
        is_admin,
        is_owner,
        verified_at
      `)
      .eq('tg_user_id', telegramId);
    
    // 3. Для каждой группы получаем информацию
    const groupsInfo = [];
    if (adminGroups && adminGroups.length > 0) {
      for (const admin of adminGroups) {
        const { data: group } = await supabase
          .from('telegram_groups')
          .select('id, tg_chat_id, title, bot_status')
          .eq('tg_chat_id', admin.tg_chat_id)
          .single();
        
        const { data: orgLink } = await supabase
          .from('org_telegram_groups')
          .select(`
            org_id,
            status,
            organizations (
              name
            )
          `)
          .eq('tg_chat_id', admin.tg_chat_id)
          .single();
        
        groupsInfo.push({
          ...admin,
          group,
          orgLink
        });
      }
    }
    
    // Формируем ответ
    const hasAccount = telegramAccounts && telegramAccounts.length > 0;
    const isVerified = hasAccount && telegramAccounts.some(acc => acc.is_verified);
    const linkedOrgs = hasAccount ? telegramAccounts.map(acc => acc.org_id).filter(Boolean) : [];
    
    return NextResponse.json({
      success: true,
      telegramId,
      diagnosis: {
        hasAccount,
        isVerified,
        accountCount: telegramAccounts?.length || 0,
        linkedOrgsCount: linkedOrgs.length,
        adminInGroupsCount: adminGroups?.length || 0,
        canSeeAvailableGroups: isVerified && adminGroups && adminGroups.length > 0
      },
      details: {
        telegramAccounts,
        linkedOrgs,
        adminGroups: groupsInfo
      },
      recommendation: getRecommendation({
        hasAccount,
        isVerified,
        adminGroups,
        groupsInfo
      })
    });
    
  } catch (error: any) {
    console.error('[Debug] Error checking Telegram user:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message
    }, { status: 500 });
  }
}

function getRecommendation(data: any): string[] {
  const recommendations: string[] = [];
  
  if (!data.hasAccount) {
    recommendations.push('❌ Telegram аккаунт не найден в системе.');
    recommendations.push('📝 Пользователь должен подключить Telegram через /app/[org]/telegram/account');
    recommendations.push('🔗 Следуйте инструкциям для верификации через @orbo_assistant_bot');
  } else if (!data.isVerified) {
    recommendations.push('⚠️ Telegram аккаунт найден, но НЕ верифицирован.');
    recommendations.push('📝 Завершите верификацию через @orbo_assistant_bot');
  } else if (!data.adminGroups || data.adminGroups.length === 0) {
    recommendations.push('⚠️ Telegram аккаунт верифицирован, но нет записей в telegram_group_admins.');
    recommendations.push('🔄 Откройте страницу /app/[org]/telegram/available-groups для синхронизации прав.');
  } else {
    const groupsWithoutOrg = data.groupsInfo?.filter((g: any) => !g.orgLink) || [];
    if (groupsWithoutOrg.length > 0) {
      recommendations.push(`✅ Найдено ${groupsWithoutOrg.length} групп(ы), доступных для добавления:`);
      groupsWithoutOrg.forEach((g: any) => {
        recommendations.push(`   - ${g.group?.title || 'Unknown'} (${g.tg_chat_id})`);
      });
      recommendations.push('📝 Эти группы появятся на странице /app/[org]/telegram/available-groups');
    }
    
    const groupsWithOrg = data.groupsInfo?.filter((g: any) => g.orgLink) || [];
    if (groupsWithOrg.length > 0) {
      recommendations.push(`✅ ${groupsWithOrg.length} групп(ы) уже привязаны к организациям.`);
    }
  }
  
  return recommendations;
}


