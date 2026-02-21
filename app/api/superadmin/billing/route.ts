import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/superadmin/billing' })

  try {
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminServer()

    const { data: isSuperadmin } = await supabase
      .from('superadmins')
      .select('user_id')
      .eq('user_id', user.id)
      .single()

    if (!isSuperadmin) {
      return NextResponse.json({ error: 'Superadmin access required' }, { status: 403 })
    }

    const [
      { data: subscriptions },
      { data: orgs },
      { data: invoices },
      { data: plans },
    ] = await Promise.all([
      supabase.from('org_subscriptions').select('*').order('updated_at', { ascending: false }),
      supabase.from('organizations').select('id, name, status').order('name'),
      supabase.from('org_invoices').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('billing_plans').select('*').eq('is_active', true).order('sort_order'),
    ])

    const orgMap = new Map((orgs || []).map(o => [o.id, o]))

    const enrichedSubs = (subscriptions || []).map(sub => ({
      ...sub,
      org_name: orgMap.get(sub.org_id)?.name || 'Unknown',
      org_status: orgMap.get(sub.org_id)?.status || 'unknown',
    }))

    return NextResponse.json({
      subscriptions: enrichedSubs,
      invoices: invoices || [],
      plans: plans || [],
    })
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Billing list fetch failed')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
