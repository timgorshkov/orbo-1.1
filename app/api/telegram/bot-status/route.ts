import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/telegram/bot-status?orgId=...
 * Check if the current user has started orbo_assist_bot (notifications bot).
 * Returns { telegramLinked, assistBotStarted }
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = request.nextUrl.searchParams.get('orgId')
    if (!orgId) {
      return NextResponse.json({ error: 'Missing orgId' }, { status: 400 })
    }

    const supabase = createAdminServer()

    // Find user's Telegram ID from user_telegram_accounts or accounts
    let telegramUserId: number | null = null

    const { data: tgAccount } = await supabase
      .from('user_telegram_accounts')
      .select('telegram_user_id')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .eq('is_verified', true)
      .maybeSingle()

    if (tgAccount?.telegram_user_id) {
      telegramUserId = tgAccount.telegram_user_id
    } else {
      const { data: providerAccount } = await supabase
        .from('accounts')
        .select('provider_account_id')
        .eq('user_id', user.id)
        .eq('provider', 'telegram')
        .maybeSingle()

      if (providerAccount?.provider_account_id) {
        telegramUserId = Number(providerAccount.provider_account_id)
      }
    }

    if (!telegramUserId) {
      return NextResponse.json({
        telegramLinked: false,
        assistBotStarted: false,
      })
    }

    // Check if user has started orbo_assist_bot via getChat
    const notifBotToken = process.env.TELEGRAM_NOTIFICATIONS_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN
    if (!notifBotToken) {
      return NextResponse.json({
        telegramLinked: true,
        assistBotStarted: false,
      })
    }

    let assistBotStarted = false
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${notifBotToken}/getChat?chat_id=${telegramUserId}`
      )
      const data = await res.json()
      assistBotStarted = data.ok === true
    } catch {
      // Telegram API error — assume not started
    }

    return NextResponse.json({
      telegramLinked: true,
      assistBotStarted,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal error' },
      { status: 500 }
    )
  }
}
