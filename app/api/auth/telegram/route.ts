import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminServer, getSupabaseAdminClient } from '@/lib/server/supabaseServer'
import { logErrorToDatabase } from '@/lib/logErrorToDatabase'

// Для DB операций используем hybrid клиент (PostgreSQL)
const supabaseAdmin = createAdminServer()
// Для Auth операций используем оригинальный Supabase клиент  
const supabaseAuth = getSupabaseAdminClient()

/**
 * Проверка подлинности данных от Telegram Login Widget
 * @see https://core.telegram.org/widgets/login#checking-authorization
 */
function verifyTelegramAuth(data: any, botToken: string): boolean {
  const { hash, ...fields } = data
  
  // Создаём строку для проверки
  const dataCheckString = Object.keys(fields)
    .sort()
    .map(key => `${key}=${fields[key]}`)
    .join('\n')
  
  // Вычисляем секретный ключ
  const secretKey = crypto.createHash('sha256').update(botToken).digest()
  
  // Вычисляем хеш
  const computedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex')
  
  return computedHash === hash
}

export async function POST(req: NextRequest) {
  const forwardedFor = req.headers.get('x-forwarded-for')
  const ipAddress = forwardedFor ? forwardedFor.split(',')[0] : req.headers.get('x-real-ip')
  
  try {
    const body = await req.json()
    const { telegramData, orgId, inviteToken } = body

    if (!telegramData) {
      await logErrorToDatabase({
        level: 'warn',
        message: 'Missing telegram data in widget auth request',
        errorCode: 'AUTH_TG_WIDGET_FAILED',
        context: {
          endpoint: '/api/auth/telegram',
          reason: 'missing_data',
          ip: ipAddress
        }
      })
      return NextResponse.json({ error: 'Missing telegram data' }, { status: 400 })
    }

    // Проверяем подлинность данных от Telegram
    const botToken = process.env.TELEGRAM_BOT_TOKEN!
    if (!verifyTelegramAuth(telegramData, botToken)) {
      await logErrorToDatabase({
        level: 'warn',
        message: 'Invalid Telegram widget authentication - hash mismatch',
        errorCode: 'AUTH_TG_WIDGET_FAILED',
        context: {
          endpoint: '/api/auth/telegram',
          reason: 'invalid_hash',
          telegramUserId: telegramData.id,
          ip: ipAddress
        }
      })
      return NextResponse.json({ error: 'Invalid Telegram authentication' }, { status: 400 })
    }

    // Проверяем, что данные не старые (не более 1 дня)
    const authDate = telegramData.auth_date
    const now = Math.floor(Date.now() / 1000)
    if (now - authDate > 86400) {
      await logErrorToDatabase({
        level: 'warn',
        message: 'Telegram widget auth data is too old',
        errorCode: 'AUTH_TG_WIDGET_FAILED',
        context: {
          endpoint: '/api/auth/telegram',
          reason: 'data_expired',
          authDate,
          currentTime: now,
          ageSeconds: now - authDate,
          telegramUserId: telegramData.id,
          ip: ipAddress
        }
      })
      return NextResponse.json({ error: 'Authentication data is too old' }, { status: 400 })
    }

    const {
      id: tgUserId,
      first_name: firstName,
      last_name: lastName,
      username,
      photo_url: photoUrl
    } = telegramData

    // 1. Ищем существующего пользователя по Telegram ID
    const { data: existingAccount } = await supabaseAdmin
      .from('user_telegram_accounts')
      .select('user_id')
      .eq('telegram_user_id', tgUserId)
      .eq('is_verified', true)
      .maybeSingle()

    let userId: string
    let isNewUser = false

    if (existingAccount?.user_id) {
      // Пользователь уже существует
      userId = existingAccount.user_id
    } else {
      // Создаём нового пользователя
      isNewUser = true
      
      // Используем Telegram ID как основу для email (технический)
      const email = `tg${tgUserId}@telegram.user`
      const password = crypto.randomBytes(32).toString('hex')

      const { data: newUser, error: signUpError } = await supabaseAuth.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // автоматически подтверждаем
        user_metadata: {
          telegram_id: tgUserId,
          telegram_username: username,
          full_name: `${firstName}${lastName ? ' ' + lastName : ''}`,
          photo_url: photoUrl
        }
      })

      if (signUpError || !newUser.user) {
        await logErrorToDatabase({
          level: 'error',
          message: `Failed to create user via Telegram widget: ${signUpError?.message || 'Unknown error'}`,
          errorCode: 'AUTH_TG_WIDGET_ERROR',
          context: {
            endpoint: '/api/auth/telegram',
            dbError: signUpError?.message,
            telegramUserId: tgUserId,
            ip: ipAddress
          }
        })
        return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
      }

      userId = newUser.user.id
    }

    // 2. Обрабатываем доступ к организации
    let targetOrgId = orgId

    if (inviteToken) {
      // Используем invite token
      const { data: invite } = await supabaseAdmin
        .from('organization_invites')
        .select('*')
        .eq('token', inviteToken)
        .eq('is_active', true)
        .maybeSingle()

      if (!invite) {
        return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 400 })
      }

      // Проверяем срок действия
      if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
        return NextResponse.json({ error: 'Invite has expired' }, { status: 400 })
      }

      // Проверяем лимит использований
      if (invite.max_uses && invite.current_uses >= invite.max_uses) {
        return NextResponse.json({ error: 'Invite limit reached' }, { status: 400 })
      }

      targetOrgId = invite.org_id

      // Проверяем, не использовал ли уже этот пользователь приглашение
      const { data: existingUse } = await supabaseAdmin
        .from('organization_invite_uses')
        .select('id')
        .eq('invite_id', invite.id)
        .eq('telegram_user_id', tgUserId)
        .maybeSingle()

      if (!existingUse) {
        // Создаём/обновляем participant
        await supabaseAdmin
          .from('participants')
          .upsert({
            org_id: invite.org_id,
            tg_user_id: tgUserId,
            username: username,
            full_name: `${firstName}${lastName ? ' ' + lastName : ''}`,
            photo_url: photoUrl,
            participant_status: invite.access_type === 'full' ? 'participant' : 'event_attendee',
            source: 'invite',
            user_id: userId
          }, {
            onConflict: 'org_id,tg_user_id',
            ignoreDuplicates: false
          })
        
        // Создаём membership для участников с полным доступом
        if (invite.access_type === 'full') {
          await supabaseAdmin
            .from('memberships')
            .upsert({
              org_id: invite.org_id,
              user_id: userId,
              role: 'member',
              role_source: 'invite'
            }, {
              onConflict: 'org_id,user_id',
              ignoreDuplicates: false
            })
        }

        // Увеличиваем счётчик использований
        await supabaseAdmin
          .from('organization_invites')
          .update({ current_uses: invite.current_uses + 1 })
          .eq('id', invite.id)

        // Логируем использование
        await supabaseAdmin
          .from('organization_invite_uses')
          .insert({
            invite_id: invite.id,
            user_id: userId,
            telegram_user_id: tgUserId,
            telegram_username: username,
            ip_address: ipAddress,
            user_agent: req.headers.get('user-agent')
          })
      }
    } else if (targetOrgId) {
      // Проверяем, есть ли участник в базе (через Telegram-группы)
      const { data: existingParticipant } = await supabaseAdmin
        .from('participants')
        .select('id, participant_status')
        .eq('org_id', targetOrgId)
        .eq('tg_user_id', tgUserId)
        .maybeSingle()

      if (!existingParticipant) {
        // Participant не найден, проверяем участие в группах организации
        
        // 1. Получаем список tg_chat_id групп организации
        const { data: orgGroups } = await supabaseAdmin
          .from('org_telegram_groups')
          .select('tg_chat_id')
          .eq('org_id', targetOrgId)
        
        const orgChatIds = (orgGroups || []).map(g => String(g.tg_chat_id))
        
        if (orgChatIds.length === 0) {
          return NextResponse.json({
            error: 'No access to this organization. Please use an invite link.',
            needsInvite: true
          }, { status: 403 })
        }
        
        // 2. Проверяем активность пользователя в этих группах
        const { data: userActivity } = await supabaseAdmin
          .from('telegram_activity_events')
          .select('tg_chat_id, from_user_id, from_username, from_first_name, from_last_name')
          .eq('from_user_id', tgUserId)
          .in('tg_chat_id', orgChatIds)
          .order('event_time', { ascending: false })
          .limit(1)
        
        if (!userActivity || userActivity.length === 0) {
          // Нет активности в группах организации
          return NextResponse.json({
            error: 'Вы не являетесь участником ни одной из групп этого пространства. Используйте ссылку-приглашение или вступите в одну из групп.',
            needsInvite: true
          }, { status: 403 })
        }
        
        // 3. Пользователь есть в группах! Создаём participant
        const activityRecord = userActivity[0]
        
        const fullName = `${firstName}${lastName ? ' ' + lastName : ''}`
        
        const { error: participantError } = await supabaseAdmin
          .from('participants')
          .insert({
            org_id: targetOrgId,
            tg_user_id: tgUserId,
            username: username || activityRecord.from_username,
            tg_first_name: firstName,
            tg_last_name: lastName,
            full_name: fullName,
            photo_url: photoUrl,
            participant_status: 'participant',
            source: 'telegram_group',
            user_id: userId
          })
        
        if (!participantError) {
          // Создаём membership с role='member' для доступа в организацию
          await supabaseAdmin
            .from('memberships')
            .upsert({
              org_id: targetOrgId,
              user_id: userId,
              role: 'member',
              role_source: 'telegram_group'
            }, {
              onConflict: 'org_id,user_id',
              ignoreDuplicates: true
            })
        }
      }
    }

    // 3. Создаём/обновляем связку Telegram аккаунта
    if (isNewUser || targetOrgId) {
      await supabaseAdmin
        .from('user_telegram_accounts')
        .upsert({
          user_id: userId,
          org_id: targetOrgId,
          telegram_user_id: tgUserId,
          telegram_username: username,
          telegram_first_name: firstName,
          telegram_last_name: lastName,
          is_verified: true,
          verified_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,org_id',
          ignoreDuplicates: false
        })
    }

    // 4. Создаём сессию для пользователя
    const { data: session, error: sessionError } = await supabaseAuth.auth.admin.generateLink({
      type: 'magiclink',
      email: `tg${tgUserId}@telegram.user`,
      options: {
        redirectTo: targetOrgId ? `${process.env.NEXT_PUBLIC_APP_URL}/app/${targetOrgId}` : `${process.env.NEXT_PUBLIC_APP_URL}/orgs`
      }
    })

    if (sessionError || !session) {
      await logErrorToDatabase({
        level: 'error',
        message: `Failed to create session for Telegram user: ${sessionError?.message || 'Unknown error'}`,
        errorCode: 'AUTH_TG_WIDGET_ERROR',
        context: {
          endpoint: '/api/auth/telegram',
          reason: 'session_creation_failed',
          dbError: sessionError?.message,
          userId,
          telegramUserId: tgUserId,
          ip: ipAddress
        }
      })
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        telegram_id: tgUserId,
        username,
        full_name: `${firstName}${lastName ? ' ' + lastName : ''}`
      },
      redirectUrl: session.properties.action_link,
      orgId: targetOrgId
    })

  } catch (error) {
    await logErrorToDatabase({
      level: 'error',
      message: error instanceof Error ? error.message : 'Unknown error in Telegram widget auth',
      errorCode: 'AUTH_TG_WIDGET_ERROR',
      context: {
        endpoint: '/api/auth/telegram',
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
