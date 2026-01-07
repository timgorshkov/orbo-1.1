import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createTelegramService } from '@/lib/services/telegramService'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: '/api/telegram/bot/refresh-group' });
  let orgId: string | undefined;
  let groupId: string | undefined;
  try {
    // Проверяем авторизацию через unified auth
    const user = await getUnifiedUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const supabase = createAdminServer()
    
    // Получаем данные из запроса
    const body = await req.json()
    orgId = body.orgId
    groupId = body.groupId
    
    if (!orgId || !groupId) {
      return NextResponse.json({ 
        error: 'Organization ID and Group ID are required' 
      }, { status: 400 })
    }
    
    // Проверяем, что пользователь имеет доступ к организации
    const { data: membership, error: memberError } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single()
    
    if (memberError || !membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    
    logger.info({ org_id: orgId, group_id: groupId, user_id: user.id }, 'Refreshing group info');
    
    // Получаем группу по ID
    const { data: group, error: groupError } = await supabase
      .from('telegram_groups')
      .select('id, tg_chat_id')
      .eq('id', groupId)
      .eq('org_id', orgId)
      .single()
    
    if (groupError || !group) {
      return NextResponse.json({ 
        error: 'Group not found' 
      }, { status: 404 })
    }
    
    // Обновляем информацию о группе из Telegram API
    const telegramService = createTelegramService()
    const chatInfo = await telegramService.getChat(group.tg_chat_id)
    
    if (!chatInfo?.result) {
      return NextResponse.json({ 
        error: 'Failed to get chat information from Telegram' 
      }, { status: 500 })
    }
    
    // Проверяем, является ли бот администратором
    const chatMember = await telegramService.getChatMember(
      group.tg_chat_id, 
      Number(process.env.TELEGRAM_BOT_ID)
    )
    
    const isAdmin = chatMember?.result?.status === 'administrator'
    
    // Обновляем информацию о группе
    const updateData: any = {
      title: chatInfo.result.title,
      bot_status: isAdmin ? 'connected' : 'pending',
      last_sync_at: new Date().toISOString()
    }
    // invite_link removed in migration 071
    
    // Обновляем данные в БД
    const { error: updateError } = await supabase
      .from('telegram_groups')
      .update(updateData)
      .eq('id', group.id)
    
    if (updateError) {
      return NextResponse.json({ 
        error: 'Failed to update group information' 
      }, { status: 500 })
    }
    
    return NextResponse.json({ 
      success: true,
      status: isAdmin ? 'connected' : 'pending'
    })
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      org_id: orgId,
      group_id: groupId
    }, 'Error refreshing group info');
    return NextResponse.json({ 
      error: error.message || 'An unexpected error occurred' 
    }, { status: 500 })
  }
}
