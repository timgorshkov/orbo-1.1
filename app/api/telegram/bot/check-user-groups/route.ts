import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'
import { createTelegramService } from '@/lib/services/telegramService'
import { createAPILogger } from '@/lib/logger'

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: '/api/telegram/bot/check-user-groups' });
  try {
    const { orgId, userId, telegramId } = await req.json()
    
    if (!telegramId || !userId || !orgId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }
    
    logger.info({ org_id: orgId, user_id: userId, telegram_id: telegramId }, 'Checking user groups');
    
    const supabase = await createClientServer()
    const telegramService = createTelegramService()
    
    // Получаем список всех чатов, где бот является участником
    const allChats = await telegramService.getAllChats()
    
    if (!allChats?.length) {
      return NextResponse.json({ groups: [] })
    }
    
    // Для каждого чата проверяем, является ли пользователь админом или создателем
    for (const chatId of allChats) {
      try {
        const chatMember = await telegramService.getChatMember(chatId, telegramId)
        
        if (chatMember?.result?.status === 'administrator' || chatMember?.result?.status === 'creator') {
          // Получаем информацию о группе
          const chatInfo = await telegramService.getChat(chatId)
          
          if (chatInfo?.result) {
            // Сохраняем информацию в базе данных
            await supabase
              .from('user_group_admin_status')
              .upsert({
                user_id: userId,
                tg_chat_id: chatId,
                is_admin: true,
                checked_at: new Date().toISOString()
              })
            
            // Проверяем, существует ли уже группа в базе
            const { data: existingGroup } = await supabase
              .from('telegram_groups')
              .select('id')
              .eq('tg_chat_id', chatId)
              .single()
            
            // Если группа не существует, добавляем её в базу
            if (!existingGroup) {
              await supabase
                .from('telegram_groups')
                .insert({
                  tg_chat_id: chatId,
                  title: chatInfo.result.title,
                  added_by_user_id: userId,
                  bot_status: 'pending',
                  last_sync_at: new Date().toISOString()
                })
            }
          }
        }
      } catch (e) {
        logger.error({ 
          chat_id: chatId,
          error: e instanceof Error ? e.message : String(e)
        }, 'Error checking chat');
      }
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'Error checking user groups');
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
