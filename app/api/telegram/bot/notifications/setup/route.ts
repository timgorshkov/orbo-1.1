import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'
import { createTelegramService } from '@/lib/services/telegramService'

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { token, org_id } = await req.json()
    
    if (!token || !org_id) {
      return NextResponse.json({ success: false, error: 'Missing token or org_id' }, { status: 400 })
    }
    
    // Проверяем валидность токена
    const telegramService = createTelegramService('notifications')
    const botInfo = await telegramService.getMe()
    
    if (!botInfo?.result) {
      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 400 })
    }
    
    const botUsername = botInfo.result.username
    const botId = botInfo.result.id
    
    // Проверяем доступ к организации
    const supabase = createClientServer()
    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .select('id')
      .eq('id', org_id)
      .single()
    
    if (orgError || !orgData) {
      return NextResponse.json({ success: false, error: 'Organization not found' }, { status: 404 })
    }
    
    // Проверяем, существует ли уже бот для этой организации
    const { data: existingBot } = await supabase
      .from('telegram_bots')
      .select('id')
      .eq('org_id', org_id)
      .eq('bot_type', 'notifications')
      .single()
    
    if (existingBot) {
      // Обновляем существующего бота
      await supabase
        .from('telegram_bots')
        .update({
          token,
          username: botUsername,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingBot.id)
    } else {
      // Создаем нового бота
      await supabase
        .from('telegram_bots')
        .insert({
          org_id,
          bot_type: 'notifications',
          token,
          username: botUsername
        })
    }
    
    // Настраиваем webhook для бота уведомлений
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/telegram/notifications/webhook`
    const webhookSecret = process.env.TELEGRAM_NOTIFICATIONS_WEBHOOK_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET
    
    await telegramService.setWebhook(webhookUrl, webhookSecret!)
    
    return NextResponse.json({ 
      success: true, 
      bot: {
        username: botUsername,
        id: botId
      }
    })
  } catch (error) {
    console.error('Error setting up notifications bot:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
