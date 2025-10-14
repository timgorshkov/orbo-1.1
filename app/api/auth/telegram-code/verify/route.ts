import { NextRequest, NextResponse } from 'next/server'
import { verifyTelegramAuthCode } from '@/lib/services/telegramAuthService'

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
  console.log('[Verify API] ==================== ENDPOINT CALLED ====================');
  console.log('[Verify API] Timestamp:', new Date().toISOString());
  
  try {
    console.log('[Verify API] Parsing JSON body...');
    const body = await req.json()
    console.log('[Verify API] ✅ JSON parsed successfully');
    
    const { 
      code, 
      telegramUserId, 
      telegramUsername, 
      firstName, 
      lastName, 
      photoUrl 
    } = body

    if (!code || !telegramUserId) {
      console.log('[Verify API] ❌ Missing required fields');
      return NextResponse.json({ 
        error: 'Missing required fields',
        errorCode: 'MISSING_FIELDS'
      }, { status: 400 })
    }

    console.log(`[Verify API] Calling verifyTelegramAuthCode service for code ${code}`)

    // Вызываем сервис верификации
    const result = await verifyTelegramAuthCode({
      code,
      telegramUserId,
      telegramUsername,
      firstName,
      lastName,
      photoUrl
    })

    console.log('[Verify API] Service call completed:', { success: result.success })

    if (result.success) {
      console.log('[Verify API] ✅ Verification successful')
      return NextResponse.json({
        success: true,
        sessionUrl: result.sessionUrl,
        redirectUrl: result.redirectUrl,
        userId: result.userId,
        orgId: result.orgId
      })
    } else {
      console.log('[Verify API] ❌ Verification failed:', result.errorCode)
      
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
    console.error('[Verify API] ❌ Error in verify endpoint:', error);
    console.error('[Verify API] Error type:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('[Verify API] Error message:', error instanceof Error ? error.message : String(error));
    console.error('[Verify API] Error stack:', error instanceof Error ? error.stack : 'No stack');
    console.log(`[Verify API] ==================== ERROR ====================`);
    
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
