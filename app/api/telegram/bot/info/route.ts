import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createTelegramService } from '@/lib/services/telegramService'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: '/api/telegram/bot/info' });
  try {
    // Проверяем авторизацию через unified auth
    const user = await getUnifiedUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const supabase = createAdminServer()
    
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
    
    logger.debug({ org_id: orgId, user_id: user.id }, 'Getting bot info');
    
    // Получаем информацию о боте
    const telegramService = createTelegramService()
    const botInfo = await telegramService.getMe()
    
    // Получаем группы через org_telegram_groups
    const { data: orgGroupLinks } = await supabase
      .from('org_telegram_groups')
      .select('tg_chat_id')
      .eq('org_id', orgId)
    
    let groups: any[] = [];
    let groupsError: Error | null = null;
    if (orgGroupLinks && orgGroupLinks.length > 0) {
      const chatIds = orgGroupLinks.map(l => l.tg_chat_id);
      const { data: groupsData, error: gError } = await supabase
        .from('telegram_groups')
        .select('id, tg_chat_id, title, bot_status, last_sync_at')
        .in('tg_chat_id', chatIds);
      groups = groupsData || [];
      if (gError) {
        groupsError = new Error(gError.message || String(gError));
      }
    }
    
    if (groupsError) {
      logger.error({ error: groupsError.message, org_id: orgId }, 'Error fetching groups');
    }
    
    return NextResponse.json({ 
      bot: botInfo?.result || null,
      groups: groups || []
    })
  } catch (error: unknown) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'Error getting bot info');
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
