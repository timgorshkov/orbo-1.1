import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/invite/[token]/accept' });
  
  try {
    const { token } = await params
    const adminSupabase = createAdminServer()

    // Check if user is logged in
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Необходимо войти в аккаунт' },
        { status: 401 }
      )
    }

    // Find the invitation
    const { data: invitation, error: inviteError } = await adminSupabase
      .from('invitations')
      .select('*')
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
      return NextResponse.json(
        { error: 'Срок действия приглашения истёк' },
        { status: 410 }
      )
    }

    // Check if already used
    if (invitation.status !== 'pending') {
      return NextResponse.json(
        { error: invitation.status === 'accepted' 
            ? 'Приглашение уже принято' 
            : 'Приглашение отменено' },
        { status: 410 }
      )
    }

    // Check email match
    if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
      logger.warn({ 
        invitation_email: invitation.email, 
        user_email: user.email,
        user_id: user.id
      }, 'Email mismatch on accept')
      
      return NextResponse.json(
        { error: `Это приглашение отправлено на ${invitation.email}. Войдите с этим email.` },
        { status: 403 }
      )
    }

    // Check if user already has membership in this org
    const { data: existingMembership } = await adminSupabase
      .from('memberships')
      .select('id, role')
      .eq('org_id', invitation.org_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingMembership) {
      // Update invitation status
      await adminSupabase
        .from('invitations')
        .update({ 
          status: 'accepted',
          accepted_at: new Date().toISOString()
        })
        .eq('id', invitation.id)

      logger.info({ 
        invitation_id: invitation.id,
        user_id: user.id,
        org_id: invitation.org_id,
        existing_role: existingMembership.role
      }, 'User already has membership')

      return NextResponse.json({
        success: true,
        org_id: invitation.org_id,
        message: 'Вы уже являетесь участником этой организации'
      })
    }

    // Create membership
    const { error: membershipError } = await adminSupabase
      .from('memberships')
      .insert({
        org_id: invitation.org_id,
        user_id: user.id,
        role: invitation.role || 'admin',
        role_source: 'invitation',
        metadata: {
          invited_by: invitation.invited_by,
          invitation_id: invitation.id,
          accepted_at: new Date().toISOString()
        }
      })

    if (membershipError) {
      logger.error({ 
        error: membershipError.message,
        user_id: user.id,
        org_id: invitation.org_id
      }, 'Error creating membership')
      
      return NextResponse.json(
        { error: 'Ошибка добавления в организацию' },
        { status: 500 }
      )
    }

    // Update invitation status
    await adminSupabase
      .from('invitations')
      .update({ 
        status: 'accepted',
        accepted_at: new Date().toISOString()
      })
      .eq('id', invitation.id)

    logger.info({ 
      invitation_id: invitation.id,
      user_id: user.id,
      user_email: user.email,
      org_id: invitation.org_id,
      role: invitation.role
    }, 'Invitation accepted')

    return NextResponse.json({
      success: true,
      org_id: invitation.org_id,
      role: invitation.role
    })

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error({ error: errorMessage }, 'Error accepting invitation')
    return NextResponse.json(
      { error: 'Ошибка принятия приглашения' },
      { status: 500 }
    )
  }
}

