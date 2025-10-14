/**
 * Telegram Authorization Service
 * Сервис для верификации кодов авторизации Telegram
 */

import { createClient } from '@supabase/supabase-js'

// Supabase admin client для auth операций
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
  
  console.log(`[Supabase Fetch] ${options.method || 'GET'} ${url}`)
  
  // Создаем AbortController для timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    console.error(`[Supabase Fetch] ⏰ Timeout after 5 seconds`)
    controller.abort()
  }, 5000)
  
  try {
    console.log(`[Supabase Fetch] Starting fetch...`)
    const response = await fetch(url, { 
      ...options, 
      headers,
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    console.log(`[Supabase Fetch] Response status: ${response.status}`)
    
    if (!response.ok) {
      console.log(`[Supabase Fetch] Reading error text...`)
      const error = await response.text()
      console.error(`[Supabase Fetch] Error:`, error)
      throw new Error(`Supabase API error: ${response.status} ${error}`)
    }
    
    console.log(`[Supabase Fetch] Reading JSON...`)
    const data = await response.json()
    console.log(`[Supabase Fetch] Data received:`, Array.isArray(data) ? `${data.length} items` : 'object')
    
    return data
  } catch (error) {
    clearTimeout(timeoutId)
    
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`[Supabase Fetch] Request aborted due to timeout`)
      throw new Error('Supabase request timeout')
    }
    
    console.error(`[Supabase Fetch] Fetch error:`, error)
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
  console.log('[Auth Service] ==================== START VERIFICATION ====================')
  console.log('[Auth Service] Code:', params.code)
  console.log('[Auth Service] Telegram User ID:', params.telegramUserId)
  
  // Проверяем конфигурацию
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[Auth Service] ❌ Missing Supabase configuration')
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
    console.error('[Auth Service] ❌ Missing required fields')
    return { 
      success: false, 
      error: 'Missing required fields',
      errorCode: 'MISSING_FIELDS'
    }
  }

  try {
    // 1. Проверяем код
    console.log(`[Auth Service] Step 1: Querying telegram_auth_codes for code=${code}`)
    console.log(`[Auth Service] Supabase URL:`, process.env.NEXT_PUBLIC_SUPABASE_URL)
    console.log(`[Auth Service] Has service key:`, !!process.env.SUPABASE_SERVICE_ROLE_KEY)
    
    let authCode: any = null
    let codeError: any = null
    
    try {
      // Используем прямой HTTP запрос
      const data = await supabaseFetch(
        `telegram_auth_codes?code=eq.${code}&is_used=eq.false&select=*`
      )
      
      authCode = Array.isArray(data) && data.length > 0 ? data[0] : null
      
      console.log(`[Auth Service] Query completed - found:`, !!authCode)
    } catch (queryError) {
      console.error('[Auth Service] ❌ Query exception:', queryError)
      console.error('[Auth Service] Query error type:', queryError instanceof Error ? queryError.constructor.name : typeof queryError)
      console.error('[Auth Service] Query error message:', queryError instanceof Error ? queryError.message : String(queryError))
      
      return {
        success: false,
        error: 'Failed to query auth code',
        errorCode: 'QUERY_ERROR'
      }
    }

    if (!authCode) {
      console.error('[Auth Service] ❌ Code not found or already used')
      return { 
        success: false, 
        error: 'Invalid or already used code',
        errorCode: 'INVALID_CODE'
      }
    }

    console.log(`[Auth Service] ✅ Code found:`, {
      id: authCode.id,
      org_id: authCode.org_id,
      event_id: authCode.event_id,
      expires_at: authCode.expires_at
    })

    // 2. Проверяем срок действия
    const now = new Date()
    const expiresAt = new Date(authCode.expires_at)
    console.log(`[Auth Service] Step 2: Checking expiration`)
    
    if (expiresAt < now) {
      console.error('[Auth Service] ❌ Code expired')
      return { 
        success: false, 
        error: 'Code has expired',
        errorCode: 'EXPIRED_CODE'
      }
    }

    console.log(`[Auth Service] ✅ Code is valid`)

    // 3. Помечаем код как использованный
    console.log(`[Auth Service] Step 3: Marking code as used`)
    try {
      await supabaseFetch(`telegram_auth_codes?id=eq.${authCode.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          is_used: true,
          used_at: new Date().toISOString(),
          telegram_user_id: telegramUserId,
          telegram_username: telegramUsername
        })
      })
      console.log(`[Auth Service] ✅ Code marked as used`)
    } catch (updateError) {
      console.error('[Auth Service] ❌ Error updating code:', updateError)
      // Продолжаем даже при ошибке
    }

    // 4. Ищем существующего пользователя по Telegram ID
    console.log(`[Auth Service] Step 4: Looking for existing user`)
    const existingAccounts = await supabaseFetch(
      `user_telegram_accounts?telegram_user_id=eq.${telegramUserId}&select=user_id`
    )
    
    const existingAccount = Array.isArray(existingAccounts) && existingAccounts.length > 0 ? existingAccounts[0] : null

    let userId: string

    if (existingAccount) {
      userId = existingAccount.user_id
      console.log(`[Auth Service] ✅ Found existing user:`, userId)
    } else {
      // Создаём нового пользователя
      console.log(`[Auth Service] Creating new user`)
      const email = `telegram_${telegramUserId}@orbo.temp`
      const password = `temp_${Math.random().toString(36).slice(2)}_${Date.now()}`

      const { data: newUser, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          telegram_user_id: telegramUserId,
          telegram_username: telegramUsername,
          first_name: firstName,
          last_name: lastName
        }
      })

      if (signUpError || !newUser.user) {
        console.error('[Auth Service] Error creating user:', signUpError)
        return { 
          success: false, 
          error: 'Failed to create user',
          errorCode: 'USER_CREATION_ERROR'
        }
      }

      userId = newUser.user.id
      console.log(`[Auth Service] ✅ Created new user:`, userId)
    }

    // 5. Обработка контекста (org, event)
    let targetOrgId = authCode.org_id
    let redirectUrl = authCode.redirect_url || '/orgs'

    console.log(`[Auth Service] Step 5: Processing context - org: ${targetOrgId}, event: ${authCode.event_id}`)

    // Если есть event_id, регистрируем на событие
    if (authCode.event_id) {
      console.log(`[Auth Service] Registering user for event ${authCode.event_id}`)
      
      // Получаем org_id из события
      const events = await supabaseFetch(
        `events?id=eq.${authCode.event_id}&select=org_id`
      )
      const event = Array.isArray(events) && events.length > 0 ? events[0] : null

      if (event) {
        targetOrgId = event.org_id
        console.log(`[Auth Service] Event org_id: ${targetOrgId}`)

        // Создаём/обновляем участника
        try {
          const participant = await supabaseFetch('participants', {
            method: 'POST',
            headers: {
              'Prefer': 'resolution=merge-duplicates,return=representation'
            },
            body: JSON.stringify({
              org_id: targetOrgId,
              user_id: userId,
              full_name: `${firstName || ''} ${lastName || ''}`.trim() || telegramUsername || `User ${telegramUserId}`,
              tg_user_id: String(telegramUserId),
              username: telegramUsername,
              participant_status: 'participant',
              source: 'telegram',
              first_seen_at: new Date().toISOString()
            })
          })

          if (participant) {
            // Регистрируем на событие
            await supabaseFetch('event_registrations', {
              method: 'POST',
              headers: {
                'Prefer': 'resolution=merge-duplicates'
              },
              body: JSON.stringify({
                event_id: authCode.event_id,
                participant_id: participant.id,
                registered_at: new Date().toISOString()
              })
            })

            console.log(`[Auth Service] ✅ Registered user for event`)
          }
        } catch (err) {
          console.error('[Auth Service] Error registering participant:', err)
        }
      }
    }

    // 6. Создаём/обновляем связку Telegram аккаунта
    if (targetOrgId) {
      console.log(`[Auth Service] Step 6: Upserting telegram account for org ${targetOrgId}`)
      try {
        await supabaseFetch('user_telegram_accounts', {
          method: 'POST',
          headers: {
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify({
            user_id: userId,
            org_id: targetOrgId,
            telegram_user_id: telegramUserId,
            telegram_username: telegramUsername,
            telegram_first_name: firstName,
            telegram_last_name: lastName,
            is_verified: true,
            verified_at: new Date().toISOString()
          })
        })
        
        console.log(`[Auth Service] ✅ Telegram account linked`)
      } catch (err) {
        console.error('[Auth Service] Error linking telegram account:', err)
      }
    }

    // 7. Создаём сессию для пользователя
    console.log(`[Auth Service] Step 7: Creating session`)
    const email = `telegram_${telegramUserId}@orbo.temp`
    const { data: session, error: sessionError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        redirectTo: redirectUrl
      }
    })

    if (sessionError || !session) {
      console.error('[Auth Service] ❌ Error creating session:', sessionError)
      return { 
        success: false, 
        error: 'Failed to create session',
        errorCode: 'SESSION_ERROR'
      }
    }

    console.log(`[Auth Service] ✅ Session created`)
    console.log(`[Auth Service] ==================== SUCCESS ====================`)

    return {
      success: true,
      sessionUrl: session.properties.action_link,
      redirectUrl,
      userId,
      orgId: targetOrgId || undefined
    }

  } catch (error) {
    console.error('[Auth Service] ❌ Error:', error)
    console.error('[Auth Service] Error type:', error instanceof Error ? error.constructor.name : typeof error)
    console.error('[Auth Service] Error message:', error instanceof Error ? error.message : String(error))
    console.error('[Auth Service] ==================== ERROR ====================')
    
    return { 
      success: false, 
      error: 'Internal server error',
      errorCode: 'INTERNAL_ERROR'
    }
  }
}

