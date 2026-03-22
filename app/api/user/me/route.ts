import { NextResponse } from 'next/server'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { createAdminServer } from '@/lib/server/supabaseServer'

export async function GET() {
  try {
    const user = await getUnifiedUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const supabase = createAdminServer()
    const [userRow, tgAccounts] = await Promise.all([
      supabase.from('users').select('tg_user_id').eq('id', user.id).single(),
      supabase.from('user_telegram_accounts').select('id').eq('user_id', user.id).limit(1),
    ])

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      provider: user.provider,
      tg_user_id: userRow.data?.tg_user_id || null,
      hasTelegramAccount: !!(userRow.data?.tg_user_id || (tgAccounts.data && tgAccounts.data.length > 0)),
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

