import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'
import { createTelegramService } from '@/lib/services/telegramService'

export async function GET(req: NextRequest) {
  try {
    // Проверяем авторизацию
    const supabase = createClientServer()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Получаем параметры из URL
    const { searchParams } = new URL(req.url)
    const orgId = searchParams.get('orgId')
    
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
    
    if (memberError || !membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    
    // Получаем информацию о боте
    const telegramService = createTelegramService()
    const botInfo = await telegramService.getMe()
    
    // Получаем группы, связанные с организацией
    const { data: groups, error: groupsError } = await supabase
      .from('telegram_groups')
      .select('id, tg_chat_id, title, bot_status, last_sync_at')
      .eq('org_id', orgId)
    
    if (groupsError) {
      console.error('Error fetching groups:', groupsError)
    }
    
    return NextResponse.json({ 
      bot: botInfo?.result || null,
      groups: groups || []
    })
  } catch (error: unknown) {
    console.error('Error getting bot info:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
