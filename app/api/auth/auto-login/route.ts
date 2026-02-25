import { NextRequest, NextResponse } from 'next/server'
import { decode } from 'next-auth/jwt'
import { createAdminServer } from '@/lib/server/supabaseServer'

/**
 * Auto-login endpoint: sets a JWT session cookie and redirects.
 * Used by MiniApp registration to provide seamless login after account creation.
 * After session creation, sends a Telegram bot message if the user has a linked TG account.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')
  const redirect = searchParams.get('redirect') || '/orgs'
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru'

  if (!token) {
    return NextResponse.redirect(new URL('/signin', baseUrl))
  }

  const cookieName = process.env.NODE_ENV === 'production'
    ? '__Secure-authjs.session-token'
    : 'authjs.session-token'

  const response = NextResponse.redirect(new URL(redirect, baseUrl))

  response.cookies.set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  })

  // Send Telegram bot confirmation after session is actually created (non-blocking)
  const isNewUser = redirect.includes('new=1')
  sendTelegramConfirmation(token, cookieName, baseUrl, isNewUser).catch(() => {})

  return response
}

async function sendTelegramConfirmation(token: string, salt: string, baseUrl: string, isNewUser: boolean) {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET
  const regBotToken = process.env.TELEGRAM_REGISTRATION_BOT_TOKEN
  if (!secret || !regBotToken) return

  try {
    const decoded = await decode({ token, secret, salt })
    if (!decoded?.provider || decoded.provider !== 'telegram') return
    if (!decoded.id) return

    const supabase = createAdminServer()
    const userId = decoded.id as string
    const userName = (decoded.name as string) || (decoded.email as string) || ''

    // Find Telegram user ID
    let tgUserId: string | null = null

    const { data: account } = await supabase
      .from('accounts')
      .select('provider_account_id')
      .eq('user_id', userId)
      .eq('provider', 'telegram')
      .maybeSingle()

    if (account) {
      tgUserId = account.provider_account_id
    } else {
      const { data: tgAccount } = await supabase
        .from('user_telegram_accounts')
        .select('telegram_user_id')
        .eq('user_id', userId)
        .eq('is_verified', true)
        .limit(1)
        .maybeSingle()

      if (tgAccount) {
        tgUserId = String(tgAccount.telegram_user_id)
      }
    }

    if (!tgUserId) return

    const text = isNewUser
      ? `🎉 ${userName ? `${userName}, аккаунт` : 'Аккаунт'} создан!\n\nЭта ссылка всегда приведёт вас в личный кабинет:`
      : `✅ ${userName ? `${userName}, вы` : 'Вы'} вошли в Orbo.\n\nЭта ссылка всегда приведёт вас в личный кабинет:`

    await fetch(`https://api.telegram.org/bot${regBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: tgUserId,
        text,
        reply_markup: {
          inline_keyboard: [[
            { text: '🚀 Открыть Orbo', url: `${baseUrl}/orgs` },
          ]],
        },
      }),
    })
  } catch {
    // Non-critical, ignore errors
  }
}
