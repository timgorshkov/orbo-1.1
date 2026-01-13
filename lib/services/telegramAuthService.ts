/**
 * Telegram Authorization Service
 * Сервис для верификации кодов авторизации Telegram
 */

import { getSupabaseAdminClient, createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('TelegramAuth');

// Supabase admin client для auth операций (используем оригинальный клиент)
const supabaseAdmin = getSupabaseAdminClient();

// Создаём админ клиент для запросов к БД (более надёжный чем REST API)
function getAdminSupabase() {
  return createAdminServer();
}

// Helper для прямых HTTP запросов к Supabase REST API с timeout
async function supabaseFetch(endpoint: string, options: RequestInit = {}) {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${endpoint}`
  const headers = {
    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...options.headers
  }
  
  logger.debug({ method: options.method || 'GET', endpoint }, 'Supabase fetch');
  
  // Создаем AbortController для timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    logger.warn({ endpoint }, 'Supabase fetch timeout after 5 seconds');
    controller.abort()
  }, 5000)
  
  try {
    const response = await fetch(url, { 
      ...options, 
      headers,
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    logger.debug({ endpoint, status: response.status }, 'Supabase fetch response');
    
    if (!response.ok) {
      const error = await response.text()
      logger.error({ endpoint, status: response.status, error }, 'Supabase API error');
      throw new Error(`Supabase API error: ${response.status} ${error}`)
    }
    
    // Проверяем, есть ли тело ответа
    const text = await response.text()
    
    if (!text || text.length === 0) {
      logger.debug({ endpoint }, 'Empty response body');
      return []
    }
    
    const data = JSON.parse(text)
    logger.debug({ 
      endpoint, 
      data_type: Array.isArray(data) ? 'array' : 'object',
      items_count: Array.isArray(data) ? data.length : undefined
    }, 'Supabase fetch data received');
    
    return data
  } catch (error) {
    clearTimeout(timeoutId)
    
    if (error instanceof Error && error.name === 'AbortError') {
      logger.error({ endpoint }, 'Request aborted due to timeout');
      throw new Error('Supabase request timeout')
    }
    
    logger.error({ 
      endpoint,
      error: error instanceof Error ? error.message : String(error)
    }, 'Supabase fetch error');
    throw error
  }
}

export interface VerifyCodeParams {
  code: string
  telegramUserId: number
  telegramUsername?: string
  firstName?: string
  lastName?: string
  photoUrl?: string
}

export interface VerifyCodeResult {
  success: boolean
  sessionUrl?: string
  redirectUrl?: string
  userId?: string
  orgId?: string
  error?: string
  errorCode?: string
}

/**
 * Верифицирует код авторизации и создает сессию для пользователя
 */
export async function verifyTelegramAuthCode(params: VerifyCodeParams): Promise<VerifyCodeResult> {
  logger.info({ 
    telegram_user_id: params.telegramUserId,
    has_code: !!params.code
  }, 'Starting verification');
  
  // Проверяем конфигурацию
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    logger.error({}, 'Missing Supabase configuration');
    return {
      success: false,
      error: 'Supabase not configured',
      errorCode: 'CONFIG_ERROR'
    }
  }

  const { 
    code, 
    telegramUserId, 
    telegramUsername, 
    firstName, 
    lastName, 
    photoUrl 
  } = params

  if (!code || !telegramUserId) {
    logger.error({ 
      has_code: !!code,
      has_telegram_user_id: !!telegramUserId
    }, 'Missing required fields');
    return { 
      success: false, 
      error: 'Missing required fields',
      errorCode: 'MISSING_FIELDS'
    }
  }

  try {
    // 1. Проверяем код
    // Нормализуем код: trim, uppercase
    const normalizedCode = code.trim().toUpperCase()
    logger.info({ code, normalizedCode }, 'Querying telegram_auth_codes');
    
    let authCode: any = null
    
    try {
      // Используем Supabase клиент вместо REST API (более надёжно)
      const adminSupabase = getAdminSupabase()
      
      const { data, error: queryError } = await adminSupabase
        .from('telegram_auth_codes')
        .select('*')
        .eq('code', normalizedCode)
        .eq('is_used', false)
        .maybeSingle()
      
      if (queryError) {
        logger.error({ 
          code: normalizedCode,
          error: queryError.message,
          errorCode: queryError.code
        }, 'Query error');
        
        return {
          success: false,
          error: 'Failed to query auth code',
          errorCode: 'QUERY_ERROR'
        }
      }
      
      authCode = data
      
      logger.info({ 
        code: normalizedCode, 
        found: !!authCode,
        authCodeId: authCode?.id
      }, 'Query completed');
      
      // Если не нашли - проверим диагностически
      if (!authCode) {
        logger.debug({ code: normalizedCode }, 'Code not found, checking if code exists at all');
        
        const { data: existingCode } = await adminSupabase
          .from('telegram_auth_codes')
          .select('code, is_used, expires_at, created_at')
          .eq('code', normalizedCode)
          .maybeSingle()
        
        if (existingCode) {
          logger.warn({ 
            code: normalizedCode, 
            existingRecord: existingCode
          }, 'Code exists but is_used=true or other issue');
        } else {
          logger.warn({ code: normalizedCode }, 'Code does not exist in database at all');
        }
      }
    } catch (queryError) {
      logger.error({ 
        code: normalizedCode,
        error: queryError instanceof Error ? queryError.message : String(queryError),
        error_type: queryError instanceof Error ? queryError.constructor.name : typeof queryError
      }, 'Query exception');
      
      return {
        success: false,
        error: 'Failed to query auth code',
        errorCode: 'QUERY_ERROR'
      }
    }

    if (!authCode) {
      logger.warn({ code }, 'Code not found or already used');
      return { 
        success: false, 
        error: 'Invalid or already used code',
        errorCode: 'INVALID_CODE'
      }
    }

    logger.info({ 
      code_id: authCode.id,
      org_id: authCode.org_id,
      event_id: authCode.event_id,
      expires_at: authCode.expires_at
    }, 'Code found');

    // 2. Проверяем срок действия
    const now = new Date()
    const expiresAt = new Date(authCode.expires_at)
    logger.debug({ expires_at: authCode.expires_at }, 'Checking expiration');
    
    if (expiresAt < now) {
      logger.warn({ code_id: authCode.id, expires_at: authCode.expires_at }, 'Code expired');
      return { 
        success: false, 
        error: 'Code has expired',
        errorCode: 'EXPIRED_CODE'
      }
    }

    logger.debug({ code_id: authCode.id }, 'Code is valid');

    // 3. Связываем код с Telegram пользователем (не помечаем как использованный - это сделает endpoint)
    // ВАЖНО: Используем Supabase клиент напрямую и проверяем результат!
    logger.info({ code_id: authCode.id, telegram_user_id: telegramUserId }, 'Linking code to telegram user');
    
    const adminSupabase = getAdminSupabase()
    const { data: updatedCode, error: updateError } = await adminSupabase
      .from('telegram_auth_codes')
      .update({
        telegram_user_id: telegramUserId,
        telegram_username: telegramUsername
      })
      .eq('id', authCode.id)
      .select('id, telegram_user_id')
      .single()
    
    if (updateError) {
      logger.error({ 
        code_id: authCode.id,
        error: updateError.message,
        errorCode: updateError.code
      }, 'Failed to link code to telegram user');
      return {
        success: false,
        error: 'Failed to verify code',
        errorCode: 'UPDATE_ERROR'
      }
    }
    
    if (!updatedCode || updatedCode.telegram_user_id !== telegramUserId) {
      logger.error({ 
        code_id: authCode.id,
        expected_telegram_user_id: telegramUserId,
        actual_telegram_user_id: updatedCode?.telegram_user_id
      }, 'Code update verification failed');
      return {
        success: false,
        error: 'Failed to verify code',
        errorCode: 'UPDATE_VERIFICATION_ERROR'
      }
    }
    
    logger.info({ code_id: authCode.id, telegram_user_id: telegramUserId }, 'Code successfully linked to telegram user');

    // 4. Ищем существующего пользователя по Telegram ID
    logger.debug({ telegram_user_id: telegramUserId }, 'Looking for existing user');
    const { data: existingAccounts } = await adminSupabase
      .from('user_telegram_accounts')
      .select('user_id')
      .eq('telegram_user_id', telegramUserId)
      .limit(1)
    
    const existingAccount = existingAccounts && existingAccounts.length > 0 ? existingAccounts[0] : null

    let userId: string

    if (existingAccount) {
      userId = existingAccount.user_id
      logger.info({ user_id: userId, telegram_user_id: telegramUserId }, 'Found existing user');
    } else {
      // Создаём нового пользователя
      logger.debug({ telegram_user_id: telegramUserId }, 'Creating new user');
      const email = `telegram_${telegramUserId}@orbo.temp`
      // Временный токен для создания пользователя (не используется для входа)
      const tempAuthToken = `temp_${Math.random().toString(36).slice(2)}_${Date.now()}`

      const { data: newUser, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempAuthToken,
        email_confirm: true,
        user_metadata: {
          telegram_user_id: telegramUserId,
          telegram_username: telegramUsername,
          first_name: firstName,
          last_name: lastName
        }
      })

      if (signUpError || !newUser.user) {
        logger.error({ 
          telegram_user_id: telegramUserId,
          error: signUpError?.message
        }, 'Error creating user');
        return { 
          success: false, 
          error: 'Failed to create user',
          errorCode: 'USER_CREATION_ERROR'
        }
      }

      userId = newUser.user.id
      logger.info({ user_id: userId, telegram_user_id: telegramUserId }, 'Created new user');
    }

    // 5. Обработка контекста (org, event)
    let targetOrgId = authCode.org_id
    let redirectUrl = authCode.redirect_url || '/orgs'

    logger.debug({ 
      org_id: targetOrgId,
      event_id: authCode.event_id
    }, 'Processing context');

    // Если есть event_id, регистрируем на событие
    if (authCode.event_id) {
      logger.debug({ event_id: authCode.event_id }, 'Registering user for event');
      
      // Получаем org_id из события
      const { data: eventData } = await adminSupabase
        .from('events')
        .select('org_id')
        .eq('id', authCode.event_id)
        .single()

      if (eventData) {
        targetOrgId = eventData.org_id
        logger.debug({ org_id: targetOrgId, event_id: authCode.event_id }, 'Event org_id found');

        // Создаём/обновляем участника
        try {
          // Сначала проверяем, существует ли participant по tg_user_id
          let participantId: string | null = null
          
          logger.debug({ telegram_user_id: telegramUserId, org_id: targetOrgId }, 'Searching for participant');
          
          const { data: existingParticipants } = await adminSupabase
            .from('participants')
            .select('id')
            .eq('org_id', targetOrgId)
            .eq('tg_user_id', telegramUserId)
            .is('merged_into', null)
            .limit(1)
          
          if (existingParticipants && existingParticipants.length > 0) {
            participantId = existingParticipants[0].id
            logger.debug({ participant_id: participantId }, 'Participant already exists');
          } else {
            logger.debug({ telegram_user_id: telegramUserId, org_id: targetOrgId }, 'No participant found, creating new one');
            
            // Создаем нового participant
            const { data: newParticipant, error: participantError } = await adminSupabase
              .from('participants')
              .insert({
                org_id: targetOrgId,
                full_name: `${firstName || ''} ${lastName || ''}`.trim() || telegramUsername || `User ${telegramUserId}`,
                tg_user_id: telegramUserId,
                username: telegramUsername,
                tg_first_name: firstName,
                tg_last_name: lastName,
                participant_status: 'participant',
                source: 'telegram',
                status: 'active'
              })
              .select('id')
              .single()
            
            if (participantError) {
              logger.warn({ error: participantError.message }, 'Failed to create participant');
            } else {
              participantId = newParticipant?.id
              logger.info({ participant_id: participantId }, 'Participant created');
            }
          }
          
          logger.debug({ participant_id: participantId }, 'Participant linked to org');
        } catch (err) {
          logger.error({ 
            telegram_user_id: telegramUserId,
            org_id: targetOrgId,
            error: err instanceof Error ? err.message : String(err)
          }, 'Error registering participant');
        }
      }
    }

    // 6. Создаём/обновляем связку Telegram аккаунта
    if (targetOrgId) {
      logger.debug({ org_id: targetOrgId, user_id: userId }, 'Upserting telegram account');
      try {
        // Используем upsert для атомарной операции
        const { error: upsertError } = await adminSupabase
          .from('user_telegram_accounts')
          .upsert({
            user_id: userId,
            org_id: targetOrgId,
            telegram_user_id: telegramUserId,
            telegram_username: telegramUsername,
            telegram_first_name: firstName,
            telegram_last_name: lastName,
            is_verified: true,
            verified_at: new Date().toISOString()
          }, { 
            onConflict: 'user_id,org_id'
          })
        
        if (upsertError) {
          logger.warn({ 
            user_id: userId,
            org_id: targetOrgId,
            error: upsertError.message
          }, 'Error upserting telegram account');
        } else {
          logger.info({ user_id: userId, org_id: targetOrgId }, 'Telegram account linked');
        }
      } catch (err) {
        logger.error({ 
          user_id: userId,
          org_id: targetOrgId,
          error: err instanceof Error ? err.message : String(err)
        }, 'Error linking telegram account');
      }
    }

    // 7. Создаём ссылку для авторизации через наш endpoint
    logger.debug({ user_id: userId }, 'Creating auth link');
    
    // Формируем полный URL для редиректа
    const fullRedirectUrl = redirectUrl.startsWith('http') 
      ? redirectUrl 
      : `${process.env.NEXT_PUBLIC_APP_URL}${redirectUrl}`
    
    // Формируем ссылку на наш собственный endpoint авторизации
    const authUrl = new URL('/auth/telegram', process.env.NEXT_PUBLIC_APP_URL!)
    authUrl.searchParams.set('code', code)
    authUrl.searchParams.set('redirect', fullRedirectUrl)
    
    const sessionUrl = authUrl.toString()

    logger.info({ 
      user_id: userId,
      org_id: targetOrgId,
      redirect_url: fullRedirectUrl
    }, 'Verification successful');

    return {
      success: true,
      sessionUrl,
      redirectUrl,
      userId,
      orgId: targetOrgId || undefined
    }

  } catch (error) {
    logger.error({ 
      telegram_user_id: telegramUserId,
      error: error instanceof Error ? error.message : String(error),
      error_type: error instanceof Error ? error.constructor.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined
    }, 'Verification error');
    
    return { 
      success: false, 
      error: 'Internal server error',
      errorCode: 'INTERNAL_ERROR'
    }
  }
}

