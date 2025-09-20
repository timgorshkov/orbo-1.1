import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'


export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { telegramId } = await req.json()
    
    if (!telegramId || isNaN(telegramId)) {
      return NextResponse.json({ error: 'Invalid Telegram ID' }, { status: 400 })
    }
    
    const supabase = createClientServer()
    
    // Получаем текущего пользователя
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Обновляем профиль пользователя
    await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        telegram_user_id: telegramId,
        updated_at: new Date().toISOString()
      })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving Telegram ID:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
