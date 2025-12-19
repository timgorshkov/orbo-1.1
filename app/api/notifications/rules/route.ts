import { NextRequest, NextResponse } from 'next/server'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('NotificationRulesAPI')

// GET /api/notifications/rules?orgId={orgId}
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('orgId')

    if (!orgId) {
      return NextResponse.json({ error: 'orgId is required' }, { status: 400 })
    }

    const cookieStore = await cookies()
    const supabase = createServerComponentClient({ cookies: () => cookieStore })

    // Check user access
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check membership
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get notification rules
    const { data: rules, error } = await supabase
      .from('notification_rules')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })

    if (error) {
      logger.error({ error: error.message, org_id: orgId }, 'Error fetching notification rules')
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ rules: rules || [] })
  } catch (error) {
    logger.error({ error }, 'Unexpected error in GET /api/notifications/rules')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/notifications/rules
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { orgId, name, description, rule_type, config, use_ai, notify_owner, notify_admins, is_enabled } = body

    if (!orgId || !name || !rule_type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Validate rule_type
    const validTypes = ['negative_discussion', 'unanswered_question', 'group_inactive']
    if (!validTypes.includes(rule_type)) {
      return NextResponse.json({ error: 'Invalid rule_type' }, { status: 400 })
    }

    const cookieStore = await cookies()
    const supabase = createServerComponentClient({ cookies: () => cookieStore })

    // Check user access
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check membership
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Create notification rule
    const { data: rule, error } = await supabase
      .from('notification_rules')
      .insert({
        org_id: orgId,
        created_by: user.id,
        name,
        description: description || null,
        rule_type,
        config: config || {},
        use_ai: use_ai ?? false,
        notify_owner: notify_owner ?? true,
        notify_admins: notify_admins ?? false,
        is_enabled: is_enabled ?? true,
      })
      .select()
      .single()

    if (error) {
      logger.error({ error: error.message, org_id: orgId }, 'Error creating notification rule')
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    logger.info({ 
      rule_id: rule.id, 
      org_id: orgId, 
      rule_type,
      use_ai 
    }, 'Notification rule created')

    return NextResponse.json({ rule })
  } catch (error) {
    logger.error({ error }, 'Unexpected error in POST /api/notifications/rules')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

