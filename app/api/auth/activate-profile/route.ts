import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/auth/activate-profile' });
  try {
    const body = await request.json()
    const { email, code, action } = body

    const adminSupabase = createAdminServer()

    // Получаем текущего пользователя
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (action === 'send_code') {
      // Проверяем, не занят ли email
      const { data: existingUsers, error: userCheckError } = await adminSupabase.auth.admin.listUsers()
      
      if (userCheckError) {
        logger.error({ 
          error: userCheckError.message,
          email
        }, 'Error checking existing users');
        return NextResponse.json({ error: 'Failed to verify email' }, { status: 500 })
      }

      const existingUser = existingUsers.users.find(u => u.email?.toLowerCase() === email.toLowerCase())

      if (existingUser && existingUser.id !== user.id) {
        // Проверяем, есть ли у того пользователя Telegram
        const { data: existingTelegram } = await adminSupabase
          .from('user_telegram_accounts')
          .select('telegram_user_id')
          .eq('user_id', existingUser.id)
          .eq('is_verified', true)
          .maybeSingle()

        if (existingTelegram) {
          return NextResponse.json({
            error: 'Email уже используется другим Telegram-аккаунтом',
            conflict: 'telegram_mismatch',
            message: 'Этот email уже привязан к другому Telegram-аккаунту. Используйте другой email или обратитесь к администратору.'
          }, { status: 409 })
        } else {
          // Предложить объединить аккаунты
          return NextResponse.json({
            conflict: 'merge_accounts',
            message: 'Email уже используется. Это ваш аккаунт? Мы можем привязать ваш Telegram к существующему профилю.',
            existing_user_id: existingUser.id
          }, { status: 409 })
        }
      }

      // Генерируем код
      const verificationCode = crypto.randomInt(100000, 999999).toString()
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 минут

      // Сохраняем код в user_telegram_accounts
      const { data: telegramAccount } = await adminSupabase
        .from('user_telegram_accounts')
        .select('id, metadata')
        .eq('user_id', user.id)
        .maybeSingle()

      if (telegramAccount) {
        const currentMetadata = telegramAccount.metadata || {}
        await adminSupabase
          .from('user_telegram_accounts')
          .update({
            metadata: {
              ...currentMetadata,
              email_verification_code: verificationCode,
              email_verification_expires: expiresAt.toISOString(),
              pending_email: email
            }
          })
          .eq('id', telegramAccount.id)
      } else {
        // Если нет telegram account, создаём запись в отдельной таблице или используем другой механизм
        // Для простоты, можно сохранить в metadata пользователя через admin API
        logger.warn({ user_id: user.id }, 'No telegram account found for user, using alternative storage');
      }

      // Отправляем email с кодом
      const { getEmailService } = await import('@/lib/services/emailService')
      const emailService = getEmailService()
      
      try {
        await emailService.sendVerificationCode(email, verificationCode)
        logger.info({ email }, 'Verification code sent');
      } catch (emailError) {
        logger.error({ 
          error: emailError instanceof Error ? emailError.message : String(emailError),
          email
        }, 'Failed to send verification email');
        // Продолжаем работу даже если email не отправился
      }

      // В dev режиме также логируем код
      if (process.env.NODE_ENV === 'development') {
        logger.debug({ email, code: verificationCode }, 'DEV: Verification code');
      }

      return NextResponse.json({
        success: true,
        message: 'Код подтверждения отправлен на email',
        // В dev режиме показываем код
        ...(process.env.NODE_ENV === 'development' && { dev_code: verificationCode })
      })
    }

    if (action === 'verify_code') {
      // Проверяем код
      const { data: account } = await adminSupabase
        .from('user_telegram_accounts')
        .select('id, metadata')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!account?.metadata?.email_verification_code) {
        return NextResponse.json({ error: 'Код не найден. Запросите новый код.' }, { status: 400 })
      }

      const expiresAt = new Date(account.metadata.email_verification_expires)
      if (expiresAt < new Date()) {
        return NextResponse.json({ error: 'Код истёк. Запросите новый код.' }, { status: 400 })
      }

      if (account.metadata.email_verification_code !== code) {
        return NextResponse.json({ error: 'Неверный код' }, { status: 400 })
      }

      const pendingEmail = account.metadata.pending_email

      // Код верный, обновляем email пользователя
      const { error: updateError } = await adminSupabase.auth.admin.updateUserById(user.id, {
        email: pendingEmail,
        email_confirm: true
      })

      if (updateError) {
        logger.error({ 
          error: updateError.message,
          user_id: user.id,
          email: pendingEmail
        }, 'Error updating user email');
        return NextResponse.json({ error: 'Не удалось обновить email' }, { status: 500 })
      }

      // Обновляем memberships (убираем shadow_profile)
      const { data: memberships } = await adminSupabase
        .from('memberships')
        .select('id, metadata')
        .eq('user_id', user.id)
        .eq('role_source', 'telegram_admin')

      if (memberships && memberships.length > 0) {
        for (const membership of memberships) {
          const updatedMetadata = { ...(membership.metadata || {}) }
          delete updatedMetadata.shadow_profile
          
          await adminSupabase
            .from('memberships')
            .update({
              metadata: updatedMetadata
            })
            .eq('id', membership.id)
        }
      }

      // Очищаем временные данные
      const currentMetadata = account.metadata || {}
      delete currentMetadata.email_verification_code
      delete currentMetadata.email_verification_expires
      delete currentMetadata.pending_email

      await adminSupabase
        .from('user_telegram_accounts')
        .update({
          metadata: Object.keys(currentMetadata).length > 0 ? currentMetadata : null
        })
        .eq('id', account.id)

      return NextResponse.json({
        success: true,
        message: 'Email успешно подтверждён! Теперь у вас полные права администратора.'
      })
    }

    if (action === 'merge_accounts') {
      // Логика объединения аккаунтов (если пользователь подтверждает)
      const { existing_user_id, confirmation_code } = body

      // TODO: Реализовать логику объединения
      // 1. Проверить код подтверждения от existing_user
      // 2. Перенести telegram_user_id на existing_user
      // 3. Объединить memberships
      // 4. Удалить теневой профиль

      return NextResponse.json({
        error: 'Объединение аккаунтов пока не реализовано',
        todo: 'Contact administrator'
      }, { status: 501 })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Error in activate-profile');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/auth/activate-profile' });
  try {
    const adminSupabase = createAdminServer()

    // Получаем текущего пользователя
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Проверяем статус активации
    const { data: memberships } = await adminSupabase
      .from('memberships')
      .select('org_id, role, role_source, metadata')
      .eq('user_id', user.id)
      .eq('role_source', 'telegram_admin')

    const isShadowProfile = memberships?.some(m => m.metadata?.shadow_profile === true) || false
    const hasEmail = user.email !== null && user.email !== undefined

    return NextResponse.json({
      user_id: user.id,
      email: user.email,
      has_email: hasEmail,
      is_shadow_profile: isShadowProfile,
      needs_activation: isShadowProfile && !hasEmail,
      admin_orgs: memberships?.map(m => ({
        org_id: m.org_id,
        role: m.role,
        is_shadow: m.metadata?.shadow_profile === true
      })) || []
    })
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Error getting activation status');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

