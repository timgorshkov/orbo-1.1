import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'
import { createTelegramService } from '@/lib/services/telegramService'

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Проверяем авторизацию
    const supabase = await createClientServer()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Получаем данные из запроса
    const { orgId, groupId } = await req.json()
    
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
    
    // Если бот админ, можем получить ссылку-приглашение
    if (isAdmin) {
      const inviteLink = await telegramService.createChatInviteLink(group.tg_chat_id)
      if (inviteLink?.result?.invite_link) {
        updateData.invite_link = inviteLink.result.invite_link
      }
    }
    
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
    console.error('Error refreshing group info:', error)
    return NextResponse.json({ 
      error: error.message || 'An unexpected error occurred' 
    }, { status: 500 })
  }
}
