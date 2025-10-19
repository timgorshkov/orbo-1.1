import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orgId } = await params
    const body = await request.json()
    const { email } = body

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Invalid email' },
        { status: 400 }
      )
    }

    const supabase = await createClientServer()
    const adminSupabase = createAdminServer()

    // Проверяем аутентификацию
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Проверяем, является ли текущий пользователь владельцем организации
    const { data: membership } = await supabase
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
      } catch (emailError) {
        console.error('[EmailService] Failed to send admin notification:', emailError)
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
        console.error('Error creating invitation:', inviteError)
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
        console.log(`[EmailService] Invitation sent to ${email}`)
      } catch (emailError) {
        console.error('[EmailService] Failed to send invitation email:', emailError)
      }

      if (process.env.NODE_ENV === 'development') {
        console.log(`[DEV] Invitation created for ${email}, token: ${inviteToken}`)
        console.log(`[DEV] Invite link: ${inviteLink}`)
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
    console.error('Error in POST /api/organizations/[id]/team/add:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

