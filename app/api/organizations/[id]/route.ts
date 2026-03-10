import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

// GET /api/organizations/[id] - Get organization details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/organizations/[id]' });
  let orgId: string | undefined;
  try {
    const paramsData = await params;
    orgId = paramsData.id;
    const adminSupabase = createAdminServer()

    // Check authentication via unified auth
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check user has access to this organization
    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get organization details
    const { data: org, error } = await adminSupabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single()

    if (error || !org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    return NextResponse.json({ organization: org })
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      org_id: orgId || 'unknown'
    }, 'Error in GET /api/organizations/[id]');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH /api/organizations/[id] - Partial update (settings only, owner-only for sensitive fields)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/organizations/[id] PATCH' });
  let orgId: string | undefined;
  try {
    const paramsData = await params;
    orgId = paramsData.id;
    const adminSupabase = createAdminServer()

    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const updateData: Record<string, unknown> = {}

    // allow_telegram_admin_role can only be changed by the owner
    if (body.allow_telegram_admin_role !== undefined) {
      if (membership.role !== 'owner') {
        return NextResponse.json(
          { error: 'Только владелец может изменять настройки прав доступа' },
          { status: 403 }
        )
      }
      updateData.allow_telegram_admin_role = Boolean(body.allow_telegram_admin_role)
    }

    // Portal settings — only owner
    const portalBoolFields = [
      'portal_show_events',
      'portal_show_members',
      'portal_show_materials',
      'portal_show_apps',
    ] as const
    const hasPortalFields = portalBoolFields.some((f) => body[f] !== undefined) ||
      body.portal_welcome_html !== undefined ||
      body.public_description !== undefined ||
      body.telegram_group_link !== undefined

    if (hasPortalFields) {
      if (membership.role !== 'owner') {
        return NextResponse.json(
          { error: 'Только владелец может изменять настройки портала' },
          { status: 403 }
        )
      }
      for (const field of portalBoolFields) {
        if (body[field] !== undefined) {
          updateData[field] = Boolean(body[field])
        }
      }
      if (body.portal_welcome_html !== undefined) {
        updateData.portal_welcome_html = body.portal_welcome_html || null
      }
      if (body.public_description !== undefined) {
        updateData.public_description = body.public_description?.trim() || null
      }
      if (body.telegram_group_link !== undefined) {
        updateData.telegram_group_link = body.telegram_group_link?.trim() || null
      }
    }

    // Payment settings — owner or admin
    if (body.default_payment_link !== undefined) {
      updateData.default_payment_link = body.default_payment_link?.trim() || null
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Нет полей для обновления' }, { status: 400 })
    }

    const { data: org, error } = await adminSupabase
      .from('organizations')
      .update(updateData)
      .eq('id', orgId)
      .select()
      .single()

    if (error) {
      logger.error({ error: error.message, org_id: orgId }, 'Error updating org settings');
      return NextResponse.json({ error: 'Failed to update organization settings' }, { status: 500 })
    }

    logger.info({ org_id: orgId, fields: Object.keys(updateData) }, 'Org settings updated');
    return NextResponse.json({ success: true, organization: org })
  } catch (error: any) {
    logger.error({
      error: error.message || String(error),
      stack: error.stack,
      org_id: orgId || 'unknown'
    }, 'Error in PATCH /api/organizations/[id]');
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/organizations/[id] - Update organization
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/organizations/[id]' });
  let orgId: string | undefined;
  try {
    const paramsData = await params;
    orgId = paramsData.id;
    const adminSupabase = createAdminServer()

    // Check authentication via unified auth
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check user is owner or admin
    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only owners and admins can update organization' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { name, logo_url, public_description, telegram_group_link } = body

    // Validate input
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Organization name is required' },
        { status: 400 }
      )
    }

    // Update organization
    const updateData: any = {
      name: name.trim()
    }

    if (logo_url !== undefined) {
      updateData.logo_url = logo_url
    }

    if (public_description !== undefined) {
      updateData.public_description = public_description
    }

    if (telegram_group_link !== undefined) {
      updateData.telegram_group_link = telegram_group_link
    }

    const { data: org, error } = await adminSupabase
      .from('organizations')
      .update(updateData)
      .eq('id', orgId)
      .select()
      .single()

    if (error) {
      logger.error({ 
        error: error.message,
        org_id: orgId
      }, 'Error updating organization');
      return NextResponse.json(
        { error: 'Failed to update organization' },
        { status: 500 }
      )
    }

    logger.info({ org_id: orgId }, 'Organization updated successfully');
    return NextResponse.json({
      success: true,
      organization: org
    })
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      org_id: orgId || 'unknown'
    }, 'Error in PUT /api/organizations/[id]');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

