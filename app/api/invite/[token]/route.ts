import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/invite/[token]' });
  
  try {
    const { token } = await params
    const adminSupabase = createAdminServer()

    // Find the invitation
    const { data: invitation, error: inviteError } = await adminSupabase
      .from('invitations')
      .select(`
        id,
        email,
        role,
        status,
        expires_at,
        created_at,
        invited_by,
        org_id,
        organizations!inner (
          id,
          name
        )
      `)
      .eq('token', token)
      .single()

    if (inviteError || !invitation) {
      logger.warn({ token, error: inviteError?.message }, 'Invitation not found')
      return NextResponse.json(
        { error: 'Приглашение не найдено' },
        { status: 404 }
      )
    }

    // Check if expired
    if (new Date(invitation.expires_at) < new Date()) {
      logger.info({ token, invitation_id: invitation.id }, 'Invitation expired')
      return NextResponse.json(
        { error: 'Срок действия приглашения истёк' },
        { status: 410 }
      )
    }

    // Check if already used
    if (invitation.status !== 'pending') {
      logger.info({ token, invitation_id: invitation.id, status: invitation.status }, 'Invitation already used')
      return NextResponse.json(
        { error: invitation.status === 'accepted' 
            ? 'Приглашение уже принято' 
            : 'Приглашение отменено' },
        { status: 410 }
      )
    }

    // Get inviter info
    let inviterEmail = 'Администратор'
    if (invitation.invited_by) {
      const { data: inviter } = await adminSupabase.auth.admin.getUserById(invitation.invited_by)
      if (inviter?.user?.email) {
        inviterEmail = inviter.user.email
      }
    }

    // Check if user is logged in
    const user = await getUnifiedUser()
    
    // Format organization data
    const org = Array.isArray(invitation.organizations) 
      ? invitation.organizations[0] 
      : invitation.organizations

    const invitationData = {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expires_at: invitation.expires_at,
      organization: {
        id: org?.id || invitation.org_id,
        name: org?.name || 'Организация'
      },
      inviter: {
        email: inviterEmail
      }
    }

    // If user is not logged in, return invitation details with needsAuth flag
    if (!user) {
      return NextResponse.json({
        needsAuth: true,
        invitation: invitationData
      })
    }

    // If logged in with different email, show error
    if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
      logger.warn({ 
        invitation_email: invitation.email, 
        user_email: user.email,
        user_id: user.id
      }, 'Email mismatch')
      
      return NextResponse.json({
        error: `Это приглашение отправлено на ${invitation.email}. Войдите с этим email, чтобы принять приглашение.`,
        needsAuth: true,
        invitation: invitationData
      }, { status: 403 })
    }

    // User is logged in with correct email
    return NextResponse.json({
      invitation: invitationData
    })

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error({ error: errorMessage }, 'Error fetching invitation')
    return NextResponse.json(
      { error: 'Ошибка загрузки приглашения' },
      { status: 500 }
    )
  }
}

