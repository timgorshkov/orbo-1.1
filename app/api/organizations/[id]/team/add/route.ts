import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/organizations/[id]/team/add' });
  let orgId: string | undefined;
  try {
    const paramsData = await params;
    orgId = paramsData.id;
    const body = await request.json()
    const { email } = body

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Invalid email' },
        { status: 400 }
      )
    }

    const adminSupabase = createAdminServer()

    // Проверяем аутентификацию via unified auth
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Проверяем, является ли текущий пользователь владельцем организации
    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single()

    if (!membership || membership.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only organization owners can add administrators' },
        { status: 403 }
      )
    }

    // Ищем пользователя по email
    const { data: existingUsers } = await adminSupabase.auth.admin.listUsers()
    const existingUser = existingUsers?.users.find(u => u.email?.toLowerCase() === email.toLowerCase())

    if (existingUser) {
      // Пользователь уже зарегистрирован, добавляем membership
      
      // Проверяем, нет ли уже membership
      const { data: existingMembership } = await adminSupabase
        .from('memberships')
        .select('id, role')
        .eq('org_id', orgId)
        .eq('user_id', existingUser.id)
        .maybeSingle()

      if (existingMembership) {
        if (existingMembership.role === 'owner') {
          return NextResponse.json(
            { error: 'Пользователь уже является владельцем организации' },
            { status: 400 }
          )
        }
        if (existingMembership.role === 'admin') {
          return NextResponse.json(
            { error: 'Пользователь уже является администратором' },
            { status: 400 }
          )
        }
        // Если member, обновляем до admin
        await adminSupabase
          .from('memberships')
          .update({
            role: 'admin',
            role_source: 'manual',
            metadata: {
              promoted_at: new Date().toISOString(),
              promoted_by: user.id
            }
          })
          .eq('id', existingMembership.id)

        return NextResponse.json({
          success: true,
          message: 'Участник повышен до администратора',
          user_id: existingUser.id
        })
      }

      // Создаём новый membership
      await adminSupabase
        .from('memberships')
        .insert({
          org_id: orgId,
          user_id: existingUser.id,
          role: 'admin',
          role_source: 'manual',
          metadata: {
            added_at: new Date().toISOString(),
            added_by: user.id
          }
        })

      // Отправляем уведомление новому админу
      const { getEmailService } = await import('@/lib/services/emailService')
      const emailService = getEmailService()
      
      // Получаем название организации
      const { data: org } = await adminSupabase
        .from('organizations')
        .select('name')
        .eq('id', orgId)
        .single()
      
      try {
        await emailService.sendAdminNotification(
          existingUser.email!,
          org?.name || 'организации'
        )
        logger.info({ 
          email: existingUser.email,
          org_id: orgId
        }, 'Admin notification sent');
      } catch (emailError) {
        logger.error({ 
          error: emailError instanceof Error ? emailError.message : String(emailError),
          email: existingUser.email,
          org_id: orgId
        }, 'Failed to send admin notification');
      }

      return NextResponse.json({
        success: true,
        message: 'Администратор успешно добавлен',
        user_id: existingUser.id
      })
    } else {
      // Пользователь не зарегистрирован, создаём приглашение
      
      // Проверяем, нет ли уже активного приглашения
      const { data: existingInvite } = await adminSupabase
        .from('invitations')
        .select('id, status')
        .eq('org_id', orgId)
        .eq('email', email.toLowerCase())
        .eq('status', 'pending')
        .maybeSingle()

      if (existingInvite) {
        return NextResponse.json(
          { error: 'Приглашение уже отправлено на этот email' },
          { status: 400 }
        )
      }

      // Создаём приглашение
      const inviteToken = crypto.randomUUID()
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 дней

      const { data: invitation, error: inviteError } = await adminSupabase
        .from('invitations')
        .insert({
          org_id: orgId,
          email: email.toLowerCase(),
          role: 'admin',
          token: inviteToken,
          expires_at: expiresAt.toISOString(),
          invited_by: user.id,
          status: 'pending'
        })
        .select()
        .single()

      if (inviteError) {
        logger.error({ 
          error: inviteError.message,
          email,
          org_id: orgId
        }, 'Error creating invitation');
        return NextResponse.json(
          { error: 'Не удалось создать приглашение' },
          { status: 500 }
        )
      }

      // Отправляем приглашение на email
      const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${inviteToken}`
      
      const { getEmailService } = await import('@/lib/services/emailService')
      const emailService = getEmailService()
      
      // Получаем информацию об организации и пригласившем
      const { data: org } = await adminSupabase
        .from('organizations')
        .select('name')
        .eq('id', orgId)
        .single()
      
      const { data: inviter } = await adminSupabase.auth.admin.getUserById(user.id)
      const inviterName = inviter.user?.email || 'Администратор'
      
      try {
        await emailService.sendAdminInvitation(
          email,
          inviteLink,
          org?.name || 'организации',
          inviterName
        )
        logger.info({ 
          email,
          org_id: orgId,
          invitation_id: invitation.id
        }, 'Invitation sent');
      } catch (emailError) {
        logger.error({ 
          error: emailError instanceof Error ? emailError.message : String(emailError),
          email,
          org_id: orgId
        }, 'Failed to send invitation email');
      }

      if (process.env.NODE_ENV === 'development') {
        logger.debug({ 
          email,
          token: inviteToken,
          link: inviteLink
        }, 'DEV: Invitation created');
      }

      return NextResponse.json({
        success: true,
        message: 'Приглашение отправлено на email',
        invitation_id: invitation.id,
        // В dev режиме возвращаем токен
        ...(process.env.NODE_ENV === 'development' && { invite_token: inviteToken })
      })
    }
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      org_id: orgId || 'unknown'
    }, 'Error in POST /api/organizations/[id]/team/add');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

