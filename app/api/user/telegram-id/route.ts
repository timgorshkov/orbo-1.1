import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'


export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: '/api/user/telegram-id' });
  try {
    const { telegramId } = await req.json()
    
    if (!telegramId || isNaN(telegramId)) {
      return NextResponse.json({ error: 'Invalid Telegram ID' }, { status: 400 })
    }
    
    // Получаем текущего пользователя via unified auth
    const user = await getUnifiedUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const adminSupabase = createAdminServer()
    
    // Обновляем профиль пользователя
    await adminSupabase
      .from('profiles')
      .upsert({
        id: user.id,
        telegram_user_id: telegramId,
        updated_at: new Date().toISOString()
      })
    
    logger.info({ telegram_id: telegramId, user_id: user.id }, 'Telegram ID saved');
    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'Error saving Telegram ID');
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
