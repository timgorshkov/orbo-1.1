import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/logAdminAction'

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

    // Ищем пользователя по email (direct PostgreSQL query)
    const { data: existingUser } = await adminSupabase
      .from('users')
      .select('id, email, name')
      .ilike('email', email.toLowerCase())
      .single()

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

        // Закрываем «висящие» pending-приглашения на этот email для этой org:
        // пользователь уже фактически в команде, приглашение сыграло свою роль.
        // Без этого UI показывает лишние pending и счётчик admin не совпадает.
        await adminSupabase.raw(
          `UPDATE invitations
              SET status = 'accepted',
                  accepted_at = NOW()
            WHERE org_id = $1
              AND LOWER(email) = LOWER($2)
              AND status = 'pending'`,
          [orgId, email]
        )

        logAdminAction({
          orgId: orgId!,
          userId: user.id,
          action: AdminActions.ADD_TEAM_MEMBER,
          resourceType: ResourceTypes.TEAM_MEMBER,
          resourceId: existingUser.id,
          metadata: { email, role: 'admin', method: 'promote' },
        }).catch(() => {});

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

      // Закрываем «висящие» pending-приглашения на этот email для этой org —
      // см. комментарий выше в ветке promote.
      await adminSupabase.raw(
        `UPDATE invitations
            SET status = 'accepted',
                accepted_at = NOW()
          WHERE org_id = $1
            AND LOWER(email) = LOWER($2)
            AND status = 'pending'`,
        [orgId, email]
      )

      // Отправляем уведомление новому админу (через новый email провайдер)
      const { sendEmail } = await import('@/lib/services/email')
      
      // Получаем название организации
      const { data: org } = await adminSupabase
        .from('organizations')
        .select('name')
        .eq('id', orgId)
        .single()
      
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru'
      const orgName = org?.name || 'организации'
      
      const signInUrl = `${appUrl}/signin?email=${encodeURIComponent(existingUser.email!)}`
      try {
        await sendEmail({
          to: existingUser.email!,
          subject: `Вы добавлены в команду ${orgName}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 24px; text-align: center; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 24px;">Orbo</h1>
              </div>
              <div style="background: #ffffff; padding: 32px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
                <h2 style="color: #1f2937; margin-top: 0;">Добро пожаловать в команду!</h2>
                <p style="font-size: 16px;">
                  Вас добавили в команду организации <strong>${orgName}</strong> как администратора.
                </p>
                <p style="font-size: 15px; background: #f3f4f6; border-radius: 8px; padding: 12px 16px; margin: 20px 0;">
                  <strong>Важно:</strong> у вас уже есть аккаунт в Orbo с этим email.
                  Регистрироваться заново не нужно — просто войдите.
                </p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${signInUrl}" style="display: inline-block; background: #667eea; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600;">Войти в Orbo</a>
                </div>
                <p style="font-size: 13px; color: #6b7280;">
                  После входа организация <strong>${orgName}</strong> появится в списке на <a href="${appUrl}/orgs" style="color: #667eea;">${appUrl}/orgs</a>.
                </p>
                <p style="font-size: 12px; color: #9ca3af; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
                  Ссылка на вход: <a href="${signInUrl}" style="color: #667eea; word-break: break-all;">${signInUrl}</a>
                </p>
              </div>
            </div>
          `
        })
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

      logAdminAction({
        orgId: orgId!,
        userId: user.id,
        action: AdminActions.ADD_TEAM_MEMBER,
        resourceType: ResourceTypes.TEAM_MEMBER,
        resourceId: existingUser.id,
        metadata: { email, role: 'admin', method: 'direct_add' },
      }).catch(() => {});

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
        .select('id, status, token, expires_at')
        .eq('org_id', orgId)
        .eq('email', email.toLowerCase())
        .eq('status', 'pending')
        .maybeSingle()

      // Если resend=true и приглашение есть - обновляем токен и отправляем заново
      const resend = body.resend === true
      
      if (existingInvite && !resend) {
        return NextResponse.json(
          { error: 'Приглашение уже отправлено на этот email' },
          { status: 400 }
        )
      }
      
      // Resend existing invitation
      if (existingInvite && resend) {
        const newToken = crypto.randomUUID()
        const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        
        await adminSupabase
          .from('invitations')
          .update({ 
            token: newToken, 
            expires_at: newExpiresAt.toISOString() 
          })
          .eq('id', existingInvite.id)
        
        // Send email with new link
        const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${newToken}`
        const { sendTeamInvitation } = await import('@/lib/services/email')
        
        const { data: org } = await adminSupabase
          .from('organizations')
          .select('name')
          .eq('id', orgId)
          .single()
        
        const { data: inviterData } = await adminSupabase
          .from('users')
          .select('email, name')
          .eq('id', user.id)
          .single()
        const inviterName = inviterData?.email || 'Администратор'
        
        await sendTeamInvitation(email, inviteLink, org?.name || 'организации', inviterName)
        
        logger.info({ 
          email,
          org_id: orgId,
          invitation_id: existingInvite.id,
          action: 'resend'
        }, 'Invitation resent');
        
        return NextResponse.json({
          success: true,
          message: 'Приглашение отправлено повторно',
          invitation_id: existingInvite.id
        })
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

      // Отправляем приглашение на email (через новый email провайдер)
      const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${inviteToken}`
      
      const { sendTeamInvitation } = await import('@/lib/services/email')
      
      // Получаем информацию об организации и пригласившем
      const { data: org } = await adminSupabase
        .from('organizations')
        .select('name')
        .eq('id', orgId)
        .single()
      
      const { data: inviter } = await adminSupabase
        .from('users')
        .select('email, name')
        .eq('id', user.id)
        .single()
      const inviterName = inviter?.email || 'Администратор'
      
      try {
        const result = await sendTeamInvitation(
          email,
          inviteLink,
          org?.name || 'организации',
          inviterName
        )
        
        if (result.success) {
          logger.info({ 
            email,
            org_id: orgId,
            invitation_id: invitation.id,
            message_id: result.messageId
          }, 'Invitation sent');
        } else {
          logger.warn({ 
            email,
            org_id: orgId,
            error: result.error
          }, 'Invitation email not sent (provider issue)');
        }
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

      logAdminAction({
        orgId: orgId!,
        userId: user.id,
        action: AdminActions.ADD_TEAM_MEMBER,
        resourceType: ResourceTypes.TEAM_MEMBER,
        resourceId: invitation.id,
        metadata: { email, role: 'admin', method: 'invitation' },
      }).catch(() => {});

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

