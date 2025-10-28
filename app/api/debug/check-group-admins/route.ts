import { NextRequest, NextResponse } from 'next/server';
import { TelegramService } from '@/lib/services/telegramService';
import { createAdminServer } from '@/lib/server/supabaseServer';

export const dynamic = 'force-dynamic';

/**
 * Debug endpoint для проверки прав администраторов конкретной группы
 * Использование: GET /api/debug/check-group-admins?chatId=-4962287234
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const chatIdParam = searchParams.get('chatId');
    
    if (!chatIdParam) {
      return NextResponse.json({ 
        error: 'Missing chatId parameter',
        usage: '/api/debug/check-group-admins?chatId=-4962287234'
      }, { status: 400 });
    }
    
    const chatId = Number(chatIdParam);
    
    if (isNaN(chatId)) {
      return NextResponse.json({ 
        error: 'Invalid chatId - must be a number' 
      }, { status: 400 });
    }
    
    console.log(`[Debug] Checking group admins for chat ${chatId}`);
    
    const telegramService = new TelegramService('main');
    const supabase = createAdminServer();
    
    // 1. Проверяем, есть ли группа в БД
    const { data: groupInDb, error: groupError } = await supabase
      .from('telegram_groups')
      .select('*')
      .eq('tg_chat_id', chatId)
      .single();
    
    console.log(`[Debug] Group in DB:`, groupInDb);
    
    // 2. Пробуем получить информацию о чате через Bot API
    let chatInfo = null;
    let chatInfoError = null;
    
    try {
      const chatResponse = await telegramService.getChat(chatId);
      if (chatResponse?.ok) {
        chatInfo = chatResponse.result;
        console.log(`[Debug] Chat info from API:`, chatInfo);
      } else {
        chatInfoError = chatResponse?.description || 'Failed to get chat info';
        console.error(`[Debug] Chat info error:`, chatInfoError);
      }
    } catch (e: any) {
      chatInfoError = e.message;
      console.error(`[Debug] Chat info exception:`, e);
    }
    
    // 3. Пробуем получить список администраторов через Bot API
    let admins = null;
    let adminsError = null;
    
    try {
      const adminsResponse = await telegramService.getChatAdministrators(chatId);
      if (adminsResponse?.ok) {
        admins = adminsResponse.result;
        console.log(`[Debug] Found ${admins?.length || 0} administrators`);
      } else {
        adminsError = adminsResponse?.description || 'Failed to get administrators';
        console.error(`[Debug] Admins error:`, adminsError);
      }
    } catch (e: any) {
      adminsError = e.message;
      console.error(`[Debug] Admins exception:`, e);
    }
    
    // 4. Проверяем существующие записи в telegram_group_admins
    const { data: existingAdmins } = await supabase
      .from('telegram_group_admins')
      .select(`
        *,
        user_telegram_accounts (
          user_id,
          telegram_username
        )
      `)
      .eq('tg_chat_id', chatId);
    
    console.log(`[Debug] Existing admins in DB:`, existingAdmins);
    
    // 5. Проверяем связь с организациями
    const { data: orgLinks } = await supabase
      .from('org_telegram_groups')
      .select(`
        *,
        organizations (
          id,
          name
        )
      `)
      .eq('tg_chat_id', chatId);
    
    console.log(`[Debug] Organization links:`, orgLinks);
    
    // Формируем понятный ответ
    return NextResponse.json({
      success: true,
      chatId,
      diagnosis: {
        inDatabase: !!groupInDb,
        canAccessChat: !!chatInfo,
        canGetAdmins: !!admins,
        adminCount: admins?.length || 0,
        linkedToOrg: (orgLinks?.length || 0) > 0,
        existingAdminsInDb: existingAdmins?.length || 0
      },
      details: {
        groupInDb,
        chatInfo,
        chatInfoError,
        admins: admins?.map((admin: any) => ({
          userId: admin.user?.id,
          username: admin.user?.username,
          firstName: admin.user?.first_name,
          status: admin.status,
          isAdmin: admin.status === 'administrator' || admin.status === 'creator',
          isOwner: admin.status === 'creator',
          customTitle: admin.custom_title
        })),
        adminsError,
        existingAdminsInDb: existingAdmins,
        orgLinks
      },
      recommendation: getRecommendation({
        groupInDb,
        chatInfo,
        admins,
        adminsError,
        existingAdmins,
        orgLinks
      })
    });
    
  } catch (error: any) {
    console.error('[Debug] Error checking group admins:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}

function getRecommendation(data: any): string[] {
  const recommendations: string[] = [];
  
  if (!data.groupInDb) {
    recommendations.push('⚠️ Группа не найдена в БД. Отправьте сообщение в группу, чтобы webhook создал запись.');
  }
  
  if (!data.chatInfo) {
    recommendations.push('❌ Бот не может получить информацию о чате. Возможно, бот не добавлен в группу или был удален.');
  }
  
  if (!data.admins) {
    if (data.adminsError?.includes('chat not found')) {
      recommendations.push('❌ Telegram API не находит этот чат. Проверьте, что chat_id корректный.');
    } else if (data.adminsError?.includes('bot is not a member')) {
      recommendations.push('❌ Бот не является участником группы. Добавьте бота в группу.');
    } else if (data.adminsError?.includes('CHAT_ADMIN_REQUIRED')) {
      recommendations.push('❌ Бот должен быть администратором группы для получения списка администраторов.');
    } else {
      recommendations.push(`❌ Не удалось получить список администраторов: ${data.adminsError}`);
    }
  }
  
  if (data.admins && data.admins.length > 0 && (!data.existingAdmins || data.existingAdmins.length === 0)) {
    recommendations.push('✅ Бот видит администраторов через API, но их нет в БД. Вызовите /api/telegram/groups/update-admin-rights для синхронизации.');
  }
  
  if (data.existingAdmins && data.existingAdmins.length > 0 && (!data.orgLinks || data.orgLinks.length === 0)) {
    recommendations.push('⚠️ Администраторы есть в БД, но группа не привязана к организации. Добавьте группу через страницу "Доступные группы".');
  }
  
  if (data.admins && data.existingAdmins && data.orgLinks && data.orgLinks.length > 0) {
    recommendations.push('✅ Всё в порядке! Группа должна отображаться на странице организации.');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('ℹ️ Диагностика завершена. Проверьте детали выше.');
  }
  
  return recommendations;
}


