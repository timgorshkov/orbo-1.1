import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'
import { createTelegramService } from '@/lib/services/telegramService'

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Проверяем авторизацию (должен быть админ)
    const supabase = await createClientServer()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Получаем данные из запроса
    const { orgId } = await req.json()
    
    if (!orgId) {
      return NextResponse.json({ error: 'Organization ID is required' }, { status: 400 })
    }
    
    // Проверяем, что пользователь имеет доступ к организации
    const { data: membership, error: memberError } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single()
    
    if (memberError || !membership || membership.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    
    // Инициализируем бота
    const telegramService = createTelegramService()
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/telegram/webhook`
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || 'default-secret-replace-in-production'
    
    // Устанавливаем webhook для бота
    const webhookResult = await telegramService.setWebhook(webhookUrl, webhookSecret)
    
    // Получаем информацию о боте
    const botInfo = await telegramService.getMe()
    
    return NextResponse.json({ success: true, webhook: webhookResult, botInfo })
  } catch (error: unknown) {
    console.error('Error sending Telegram message:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
