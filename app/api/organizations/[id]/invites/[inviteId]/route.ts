import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'

// DELETE - удалить приглашение
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  try {
    const { id: orgId, inviteId } = await params
    const supabase = await createClientServer()

    // Проверяем авторизацию
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Проверяем права (только owner/admin)
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Удаляем приглашение
    const { error } = await supabase
      .from('organization_invites')
      .delete()
      .eq('id', inviteId)
      .eq('org_id', orgId)

    if (error) {
      console.error('Error deleting invite:', error)
      return NextResponse.json({ error: 'Failed to delete invite' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/organizations/[id]/invites/[inviteId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT - обновить приглашение (например, деактивировать)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  try {
    const { id: orgId, inviteId } = await params
    const supabase = await createClientServer()

    // Проверяем авторизацию
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Проверяем права (только owner/admin)
    const { data: membership } = await supabase
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
    const { data: invite, error } = await supabase
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
      console.error('Error updating invite:', error)
      return NextResponse.json({ error: 'Failed to update invite' }, { status: 500 })
    }

    return NextResponse.json(invite)
  } catch (error) {
    console.error('Error in PUT /api/organizations/[id]/invites/[inviteId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

