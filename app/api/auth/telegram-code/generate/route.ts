import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

/**
 * Генерирует одноразовый код для авторизации через Telegram бота
 * 
 * POST /api/auth/telegram-code/generate
 * Body: { orgId?: string, eventId?: string, redirectUrl?: string }
 * 
 * Возвращает: { code: string, botUsername: string, deepLink: string, qrUrl: string, expiresAt: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { orgId, eventId, redirectUrl, inviteToken } = body

    // Генерируем уникальный код (6 символов: буквы и цифры)
    let code: string = ''
    let attempts = 0
    const maxAttempts = 10

    // Пытаемся сгенерировать уникальный код
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

    if (attempts >= maxAttempts) {
      return NextResponse.json({ error: 'Failed to generate unique code' }, { status: 500 })
    }

    // Получаем IP и User Agent для безопасности
    const forwardedFor = req.headers.get('x-forwarded-for')
    const ipAddress = forwardedFor ? forwardedFor.split(',')[0] : req.headers.get('x-real-ip')
    const userAgent = req.headers.get('user-agent')

    // Срок действия: 10 минут
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

    // Сохраняем код в базу
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
      .single()

    if (insertError || !authCode) {
      console.error('Error creating auth code:', insertError)
      return NextResponse.json({ error: 'Failed to create auth code' }, { status: 500 })
    }

    // Генерируем ссылки для авторизации
    const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
    
    if (!botUsername) {
      console.error('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME not configured')
      return NextResponse.json({ error: 'Bot not configured' }, { status: 500 })
    }

    // Deep link для прямого открытия бота
    const deepLink = `https://t.me/${botUsername}`

    // QR код - используем QR Server API (бесплатный и надежный)
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(deepLink)}`

    console.log(`[Auth Code] Generated code ${code} for org ${orgId || 'none'}, event ${eventId || 'none'}`)

    return NextResponse.json({
      code: code,
      botUsername,
      deepLink,
      qrUrl,
      expiresAt: expiresAt.toISOString(),
      expiresInSeconds: 600 // 10 минут
    })

  } catch (error) {
    console.error('Error generating auth code:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

