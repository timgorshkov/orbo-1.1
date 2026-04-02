import { NextRequest, NextResponse } from 'next/server'
import { getUnifiedSession } from '@/lib/auth/unified-auth'
import { createAdminServer } from '@/lib/server/supabaseServer'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const session = await getUnifiedSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const supabase = createAdminServer()

    // Verify user exists before writing meta (JWT may contain stale/ghost user id)
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('id', session.user.id)
      .single()

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { error } = await supabase
      .from('user_registration_meta')
      .upsert({
        user_id: session.user.id,
        utm_source: body.utm_source || null,
        utm_medium: body.utm_medium || null,
        utm_campaign: body.utm_campaign || null,
        utm_content: body.utm_content || null,
        utm_term: body.utm_term || null,
        referrer_url: body.referrer_url || null,
        landing_page: body.landing_page || null,
        from_page: body.from_page || null,
        device_type: body.device_type || null,
        user_agent: body.user_agent || null,
        screen_width: body.screen_width || null,
        partner_code: body.partner_code || null,
      }, { onConflict: 'user_id' })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
