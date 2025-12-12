import { NextRequest, NextResponse } from 'next/server'
import { verifyTelegramAuthCode } from '@/lib/services/telegramAuthService'
import { logErrorToDatabase } from '@/lib/logErrorToDatabase'

/**
 * Верифицирует код авторизации и создает сессию для пользователя
 * 
 * POST /api/auth/telegram-code/verify
 * Body: { 
 *   code: string, 
 *   telegramUserId: number, 
 *   telegramUsername?: string,
 *   firstName?: string,
 *   lastName?: string,
 *   photoUrl?: string
 * }
 * 
 * Возвращает: { success: true, redirectUrl: string, sessionUrl: string }
 */
export async function POST(req: NextRequest) {
  const forwardedFor = req.headers.get('x-forwarded-for')
  const ipAddress = forwardedFor ? forwardedFor.split(',')[0] : req.headers.get('x-real-ip')
  
  try {
    const body = await req.json()
    
    const { 
      code, 
      telegramUserId, 
      telegramUsername, 
      firstName, 
      lastName, 
      photoUrl 
    } = body

    if (!code || !telegramUserId) {
      // Логируем как предупреждение - может быть бот или ошибка клиента
      await logErrorToDatabase({
        level: 'warn',
        message: 'Missing required fields for Telegram code verification',
        errorCode: 'AUTH_TG_CODE_FAILED',
        context: {
          endpoint: '/api/auth/telegram-code/verify',
          hasCode: !!code,
          hasTelegramUserId: !!telegramUserId,
          ip: ipAddress
        }
      })
      
      return NextResponse.json({ 
        error: 'Missing required fields',
        errorCode: 'MISSING_FIELDS'
      }, { status: 400 })
    }

    // Вызываем сервис верификации
    const result = await verifyTelegramAuthCode({
      code,
      telegramUserId,
      telegramUsername,
      firstName,
      lastName,
      photoUrl
    })

    if (result.success) {
      return NextResponse.json({
        success: true,
        sessionUrl: result.sessionUrl,
        redirectUrl: result.redirectUrl,
        userId: result.userId,
        orgId: result.orgId
      })
    } else {
      // Логируем неуспешную верификацию
      const isExpired = result.errorCode === 'EXPIRED_CODE'
      const isInvalid = result.errorCode === 'INVALID_CODE'
      const isDbError = result.errorCode === 'DB_ERROR'
      
      await logErrorToDatabase({
        level: isDbError ? 'error' : 'warn',
        message: `Telegram code verification failed: ${result.error}`,
        errorCode: isExpired ? 'AUTH_TG_CODE_EXPIRED' : isDbError ? 'AUTH_TG_CODE_ERROR' : 'AUTH_TG_CODE_FAILED',
        context: {
          endpoint: '/api/auth/telegram-code/verify',
          errorCode: result.errorCode,
          telegramUserId,
          telegramUsername,
          ip: ipAddress
        }
      })
      
      const statusCode = 
        result.errorCode === 'MISSING_FIELDS' ? 400 :
        result.errorCode === 'INVALID_CODE' ? 400 :
        result.errorCode === 'EXPIRED_CODE' ? 400 :
        result.errorCode === 'DB_ERROR' ? 500 :
        500
      
      return NextResponse.json({ 
        error: result.error,
        errorCode: result.errorCode
      }, { status: statusCode })
    }

  } catch (error) {
    // Логируем серверную ошибку
    await logErrorToDatabase({
      level: 'error',
      message: error instanceof Error ? error.message : 'Unknown error in Telegram code verification',
      errorCode: 'AUTH_TG_CODE_ERROR',
      context: {
        endpoint: '/api/auth/telegram-code/verify',
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        ip: ipAddress
      },
      stackTrace: error instanceof Error ? error.stack : undefined
    })
    
    // Проверяем, является ли это ошибкой парсинга JSON
    if (error instanceof Error && error.message.includes('JSON')) {
      return NextResponse.json({ 
        error: 'Invalid JSON in request body',
        errorCode: 'JSON_PARSE_ERROR',
        details: error.message
      }, { status: 400 })
    }
    
    return NextResponse.json({ 
      error: 'Internal server error',
      errorCode: 'INTERNAL_ERROR',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
