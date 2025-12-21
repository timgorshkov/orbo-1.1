import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

// DELETE - удалить приглашение
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  const logger = createAPILogger(req, { endpoint: '/api/organizations/[id]/invites/[inviteId]' });
  let orgId: string | undefined;
  let inviteId: string | undefined;
  try {
    const paramsData = await params;
    orgId = paramsData.id;
    inviteId = paramsData.inviteId;
    const adminSupabase = createAdminServer()

    // Проверяем авторизацию via unified auth
    const user = await getUnifiedUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Проверяем права (только owner/admin)
    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Удаляем приглашение
    const { error } = await adminSupabase
      .from('organization_invites')
      .delete()
      .eq('id', inviteId)
      .eq('org_id', orgId)

    if (error) {
      logger.error({ 
        error: error.message,
        org_id: orgId,
        invite_id: inviteId
      }, 'Error deleting invite');
      return NextResponse.json({ error: 'Failed to delete invite' }, { status: 500 })
    }

    logger.info({ 
      org_id: orgId,
      invite_id: inviteId
    }, 'Invite deleted');
    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      org_id: orgId || 'unknown',
      invite_id: inviteId || 'unknown'
    }, 'Error in DELETE /api/organizations/[id]/invites/[inviteId]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT - обновить приглашение (например, деактивировать)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  const logger = createAPILogger(req, { endpoint: '/api/organizations/[id]/invites/[inviteId]' });
  let orgId: string | undefined;
  let inviteId: string | undefined;
  try {
    const paramsData = await params;
    orgId = paramsData.id;
    inviteId = paramsData.inviteId;
    const adminSupabase = createAdminServer()

    // Проверяем авторизацию via unified auth
    const user = await getUnifiedUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Проверяем права (только owner/admin)
    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Получаем данные из запроса
    const body = await req.json()
    const { is_active, description, max_uses, expires_at } = body

    // Обновляем приглашение
    const { data: invite, error } = await adminSupabase
      .from('organization_invites')
      .update({
        is_active: is_active !== undefined ? is_active : undefined,
        description: description !== undefined ? description : undefined,
        max_uses: max_uses !== undefined ? max_uses : undefined,
        expires_at: expires_at !== undefined ? expires_at : undefined
      })
      .eq('id', inviteId)
      .eq('org_id', orgId)
      .select()
      .single()

    if (error) {
      logger.error({ 
        error: error.message,
        org_id: orgId,
        invite_id: inviteId
      }, 'Error updating invite');
      return NextResponse.json({ error: 'Failed to update invite' }, { status: 500 })
    }

    logger.info({ 
      org_id: orgId,
      invite_id: inviteId,
      updates: body
    }, 'Invite updated');
    return NextResponse.json(invite)
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      org_id: orgId || 'unknown',
      invite_id: inviteId || 'unknown'
    }, 'Error in PUT /api/organizations/[id]/invites/[inviteId]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

