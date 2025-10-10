import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'

// GET - получить все приглашения организации
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orgId } = await params
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

    // Получаем приглашения
    const { data: invites, error } = await supabase
      .from('organization_invites')
      .select(`
        *,
        organization_invite_uses(count)
      `)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching invites:', error)
      return NextResponse.json({ error: 'Failed to fetch invites' }, { status: 500 })
    }

    return NextResponse.json(invites)
  } catch (error) {
    console.error('Error in GET /api/organizations/[id]/invites:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - создать новое приглашение
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orgId } = await params
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
    const { access_type, description, max_uses, expires_at } = body

    // Валидация
    if (!access_type || !['full', 'events_only', 'materials_only', 'limited'].includes(access_type)) {
      return NextResponse.json({ error: 'Invalid access_type' }, { status: 400 })
    }

    // Генерируем токен
    const { data: tokenData, error: tokenError } = await supabase.rpc('generate_invite_token')

    if (tokenError) {
      console.error('Error generating token:', tokenError)
      return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 })
    }

    // Создаём приглашение
    const { data: invite, error: createError } = await supabase
      .from('organization_invites')
      .insert({
        org_id: orgId,
        token: tokenData,
        created_by: user.id,
        access_type,
        description: description || null,
        max_uses: max_uses || null,
        expires_at: expires_at || null,
        is_active: true
      })
      .select()
      .single()

    if (createError) {
      console.error('Error creating invite:', createError)
      return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
    }

    return NextResponse.json(invite, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/organizations/[id]/invites:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

