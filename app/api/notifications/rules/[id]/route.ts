import { NextRequest, NextResponse } from 'next/server'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('NotificationRuleAPI')

// GET /api/notifications/rules/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    const cookieStore = await cookies()
    const supabase = createServerComponentClient({ cookies: () => cookieStore })

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: rule, error } = await supabase
      .from('notification_rules')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !rule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
    }

    // Check membership
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', rule.org_id)
      .eq('user_id', user.id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ rule })
  } catch (error) {
    logger.error({ error }, 'Error in GET /api/notifications/rules/[id]')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/notifications/rules/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { name, description, rule_type, config, use_ai, notify_owner, notify_admins, is_enabled } = body

    const cookieStore = await cookies()
    const supabase = createServerComponentClient({ cookies: () => cookieStore })

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get existing rule to check access
    const { data: existingRule } = await supabase
      .from('notification_rules')
      .select('org_id')
      .eq('id', id)
      .single()

    if (!existingRule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
    }

    // Check membership
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', existingRule.org_id)
      .eq('user_id', user.id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Update rule
    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (rule_type !== undefined) updateData.rule_type = rule_type
    if (config !== undefined) updateData.config = config
    if (use_ai !== undefined) updateData.use_ai = use_ai
    if (notify_owner !== undefined) updateData.notify_owner = notify_owner
    if (notify_admins !== undefined) updateData.notify_admins = notify_admins
    if (is_enabled !== undefined) updateData.is_enabled = is_enabled

    const { data: rule, error } = await supabase
      .from('notification_rules')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      logger.error({ error: error.message, rule_id: id }, 'Error updating notification rule')
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    logger.info({ rule_id: id, updates: Object.keys(updateData) }, 'Notification rule updated')

    return NextResponse.json({ rule })
  } catch (error) {
    logger.error({ error }, 'Error in PUT /api/notifications/rules/[id]')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/notifications/rules/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    const cookieStore = await cookies()
    const supabase = createServerComponentClient({ cookies: () => cookieStore })

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get existing rule to check access
    const { data: existingRule } = await supabase
      .from('notification_rules')
      .select('org_id')
      .eq('id', id)
      .single()

    if (!existingRule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
    }

    // Check membership
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', existingRule.org_id)
      .eq('user_id', user.id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Delete rule
    const { error } = await supabase
      .from('notification_rules')
      .delete()
      .eq('id', id)

    if (error) {
      logger.error({ error: error.message, rule_id: id }, 'Error deleting notification rule')
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    logger.info({ rule_id: id }, 'Notification rule deleted')

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error({ error }, 'Error in DELETE /api/notifications/rules/[id]')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

