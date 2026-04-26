import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { logErrorToDatabase } from '@/lib/logErrorToDatabase'
import { createAPILogger } from '@/lib/logger'
import { RequestTiming } from '@/lib/utils/timing'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import crypto from 'crypto'

/**
 * Генерирует одноразовый код для авторизации через Telegram бота
 * 
 * POST /api/auth/telegram-code/generate
 * Body: { orgId?: string, eventId?: string, redirectUrl?: string }
 * 
 * Возвращает: { code: string, botUsername: string, deepLink: string, qrUrl: string, expiresAt: string }
 */
export async function POST(req: NextRequest) {
  const timing = new RequestTiming('TelegramCodeGenerate');
  const logger = createAPILogger(req, { endpoint: 'telegram-code/generate' });
  const forwardedFor = req.headers.get('x-forwarded-for')
  const ipAddress = forwardedFor ? forwardedFor.split(',')[0] : req.headers.get('x-real-ip')
  
  try {
    const supabaseAdmin = createAdminServer()

    // Capture logged-in user (optional — anonymous callers, e.g. event registration, pass no session)
    const sessionUser = await getUnifiedUser().catch(() => null)

    const body = await req.json()
    const { orgId, eventId, redirectUrl, inviteToken } = body

    // Получаем IP и User Agent для безопасности
    const userAgent = req.headers.get('user-agent')

    // Срок действия: 10 минут
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

    // Generate + insert in one round-trip per attempt (was: SELECT then INSERT = 2 round-trips).
    // 6 hex chars ⇒ 16M combinations vs at-most a few thousand active codes — collision is rare,
    // so we insert speculatively and retry on the unique_violation error.
    let code: string = ''
    let authCode: any = null
    let lastInsertError: any = null
    const maxAttempts = 5

    timing.mark('insert_code_start');
    for (let attempts = 0; attempts < maxAttempts; attempts++) {
      code = crypto.randomBytes(3).toString('hex').toUpperCase()
      const insertResult = await supabaseAdmin
        .from('telegram_auth_codes')
        .insert({
          code,
          org_id: orgId || null,
          event_id: eventId || null,
          redirect_url: redirectUrl || null,
          expires_at: expiresAt.toISOString(),
          ip_address: ipAddress,
          user_agent: userAgent,
          // If a logged-in user generates a code (e.g. from the welcome screen to link TG
          // to an existing email account), store their id so verifyTelegramAuthCode can
          // update that user's tg_user_id instead of creating a new TG-only account.
          user_id: sessionUser?.id || null,
        })
        .select()
        .single();

      if (!insertResult.error && insertResult.data) {
        authCode = insertResult.data
        break
      }
      // 23505 = unique_violation. Anything else is a real error — bail out.
      lastInsertError = insertResult.error
      if (insertResult.error?.code !== '23505') break
    }
    timing.mark('insert_code_end');
    timing.measure('insert_code', 'insert_code_start', 'insert_code_end');

    const insertError = authCode ? null : lastInsertError

    if (insertError || !authCode) {
      await logErrorToDatabase({
        level: 'error',
        message: `Failed to create auth code: ${insertError?.message || 'Unknown error'}`,
        errorCode: 'AUTH_TG_GENERATE_ERROR',
        context: {
          endpoint: '/api/auth/telegram-code/generate',
          dbError: insertError?.message,
          orgId,
          eventId,
          ip: ipAddress
        }
      })
      return NextResponse.json({ error: 'Failed to create auth code' }, { status: 500 })
    }

    // Генерируем ссылки для авторизации
    const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
    
    if (!botUsername) {
      await logErrorToDatabase({
        level: 'error',
        message: 'NEXT_PUBLIC_TELEGRAM_BOT_USERNAME not configured',
        errorCode: 'AUTH_TG_GENERATE_ERROR',
        context: {
          endpoint: '/api/auth/telegram-code/generate',
          reason: 'bot_not_configured'
        }
      })
      return NextResponse.json({ error: 'Bot not configured' }, { status: 500 })
    }

    // Deep link для прямого открытия бота
    const deepLink = `https://t.me/${botUsername}`

    // QR код - используем QR Server API (бесплатный и надежный)
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(deepLink)}`
    
    // Log timing summary (only if > 200ms)
    timing.logSummary(logger, 200);

    return NextResponse.json({
      code: code,
      botUsername,
      deepLink,
      qrUrl,
      expiresAt: expiresAt.toISOString(),
      expiresInSeconds: 600 // 10 минут
    })

  } catch (error) {
    await logErrorToDatabase({
      level: 'error',
      message: error instanceof Error ? error.message : 'Unknown error generating auth code',
      errorCode: 'AUTH_TG_GENERATE_ERROR',
      context: {
        endpoint: '/api/auth/telegram-code/generate',
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        ip: ipAddress
      },
      stackTrace: error instanceof Error ? error.stack : undefined
    })
    
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
