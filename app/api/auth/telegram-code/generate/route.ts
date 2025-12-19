import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { logErrorToDatabase } from '@/lib/logErrorToDatabase'
import { createAPILogger } from '@/lib/logger'
import { RequestTiming } from '@/lib/utils/timing'
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
    
    const body = await req.json()
    const { orgId, eventId, redirectUrl, inviteToken } = body

    // Генерируем уникальный код (6 символов: буквы и цифры)
    let code: string = ''
    let attempts = 0
    const maxAttempts = 10

    // Пытаемся сгенерировать уникальный код
    timing.mark('generate_unique_code_start');
    while (attempts < maxAttempts) {
      // Генерируем 3 байта и конвертируем в hex (6 символов)
      code = crypto.randomBytes(3).toString('hex').toUpperCase()

      // Проверяем, не занят ли код
      const { data: existing } = await supabaseAdmin
        .from('telegram_auth_codes')
        .select('id')
        .eq('code', code)
        .eq('is_used', false)
        .maybeSingle()

      if (!existing) {
        break // Код уникален
      }

      attempts++
    }
    timing.mark('generate_unique_code_end');
    timing.measure('generate_unique_code', 'generate_unique_code_start', 'generate_unique_code_end');

    if (attempts >= maxAttempts) {
      await logErrorToDatabase({
        level: 'error',
        message: 'Failed to generate unique auth code after max attempts',
        errorCode: 'AUTH_TG_GENERATE_ERROR',
        context: {
          endpoint: '/api/auth/telegram-code/generate',
          maxAttempts,
          orgId,
          eventId,
          ip: ipAddress
        }
      })
      return NextResponse.json({ error: 'Failed to generate unique code' }, { status: 500 })
    }

    // Получаем IP и User Agent для безопасности
    const userAgent = req.headers.get('user-agent')

    // Срок действия: 10 минут
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

    // Сохраняем код в базу
    timing.mark('insert_code_start');
    const { data: authCode, error: insertError } = await supabaseAdmin
      .from('telegram_auth_codes')
      .insert({
        code: code,
        org_id: orgId || null,
        event_id: eventId || null,
        redirect_url: redirectUrl || null,
        expires_at: expiresAt.toISOString(),
        ip_address: ipAddress,
        user_agent: userAgent
      })
      .select()
      .single();
    timing.mark('insert_code_end');
    timing.measure('insert_code', 'insert_code_start', 'insert_code_end');

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
