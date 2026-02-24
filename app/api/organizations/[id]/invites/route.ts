import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/logAdminAction'

// GET - получить все приглашения организации
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(req, { endpoint: '/api/organizations/[id]/invites' });
  let orgId: string | undefined;
  try {
    const paramsData = await params;
    orgId = paramsData.id;
    
    const user = await getUnifiedUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminServer()

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
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })

    if (error) {
      logger.error({ 
        error: error.message,
        org_id: orgId
      }, 'Error fetching invites');
      return NextResponse.json({ error: 'Failed to fetch invites' }, { status: 500 })
    }

    // Получаем количество использований для каждого приглашения
    const inviteIds = invites?.map(i => i.id) || [];
    let usesMap = new Map<string, number>();
    
    if (inviteIds.length > 0) {
      const { data: uses } = await supabase
        .from('organization_invite_uses')
        .select('invite_id')
        .in('invite_id', inviteIds);
      
      for (const use of uses || []) {
        usesMap.set(use.invite_id, (usesMap.get(use.invite_id) || 0) + 1);
      }
    }

    // Добавляем count к каждому приглашению
    const invitesWithCount = invites?.map(invite => ({
      ...invite,
      organization_invite_uses: [{ count: usesMap.get(invite.id) || 0 }]
    })) || [];

    logger.info({ 
      invite_count: invitesWithCount.length,
      org_id: orgId
    }, 'Fetched invites');
    return NextResponse.json(invitesWithCount)
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      org_id: orgId || 'unknown'
    }, 'Error in GET /api/organizations/[id]/invites');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - создать новое приглашение
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(req, { endpoint: '/api/organizations/[id]/invites' });
  let orgId: string | undefined;
  try {
    const paramsData = await params;
    orgId = paramsData.id;
    
    const user = await getUnifiedUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminServer()

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
      logger.error({ 
        error: tokenError.message,
        org_id: orgId
      }, 'Error generating token');
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
      logger.error({ 
        error: createError.message,
        org_id: orgId,
        access_type
      }, 'Error creating invite');
      return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
    }

    logger.info({ 
      invite_id: invite.id,
      org_id: orgId,
      access_type
    }, 'Invite created');
    
    logAdminAction({
      orgId: orgId!,
      userId: user.id,
      action: AdminActions.CREATE_INVITE,
      resourceType: ResourceTypes.INVITE,
      resourceId: invite.id,
      metadata: { access_type, max_uses, has_expiry: !!expires_at },
    }).catch(() => {});
    
    return NextResponse.json(invite, { status: 201 })
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      org_id: orgId || 'unknown'
    }, 'Error in POST /api/organizations/[id]/invites');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

