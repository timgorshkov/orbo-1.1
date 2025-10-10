import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

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
  try {
    const body = await req.json()
    const { telegramData, orgId, inviteToken } = body

    if (!telegramData) {
      return NextResponse.json({ error: 'Missing telegram data' }, { status: 400 })
    }

    // Проверяем подлинность данных от Telegram
    const botToken = process.env.TELEGRAM_BOT_TOKEN!
    if (!verifyTelegramAuth(telegramData, botToken)) {
      console.error('Invalid Telegram authentication')
      return NextResponse.json({ error: 'Invalid Telegram authentication' }, { status: 400 })
    }

    // Проверяем, что данные не старые (не более 1 дня)
    const authDate = telegramData.auth_date
    const now = Math.floor(Date.now() / 1000)
    if (now - authDate > 86400) {
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

      const { data: newUser, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
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
        console.error('Error creating user:', signUpError)
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
            source: 'invite'
          }, {
            onConflict: 'org_id,tg_user_id',
            ignoreDuplicates: false
          })

        // Увеличиваем счётчик использований
        await supabaseAdmin
          .from('organization_invites')
          .update({ current_uses: invite.current_uses + 1 })
          .eq('id', invite.id)

        // Логируем использование
        const forwardedFor = req.headers.get('x-forwarded-for')
        const ipAddress = forwardedFor ? forwardedFor.split(',')[0] : req.headers.get('x-real-ip')
        
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
        return NextResponse.json({
          error: 'No access to this organization. Please use an invite link.',
          needsInvite: true
        }, { status: 403 })
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
    const { data: session, error: sessionError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: `tg${tgUserId}@telegram.user`,
      options: {
        redirectTo: targetOrgId ? `${process.env.NEXT_PUBLIC_APP_URL}/app/${targetOrgId}` : `${process.env.NEXT_PUBLIC_APP_URL}/orgs`
      }
    })

    if (sessionError || !session) {
      console.error('Error creating session:', sessionError)
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
    console.error('Telegram auth error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

