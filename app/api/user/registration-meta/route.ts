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

    // Check if a row already exists (e.g. created server-side during Telegram registration).
    // If it does, only fill in fields that are currently null — never overwrite existing values.
    const { data: existing } = await supabase
      .from('user_registration_meta')
      .select('user_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer_url, landing_page, from_page, device_type, user_agent, screen_width, partner_code')
      .eq('user_id', session.user.id)
      .maybeSingle()

    const merged = {
      user_id: session.user.id,
      utm_source: existing?.utm_source || body.utm_source || null,
      utm_medium: existing?.utm_medium || body.utm_medium || null,
      utm_campaign: existing?.utm_campaign || body.utm_campaign || null,
      utm_content: existing?.utm_content || body.utm_content || null,
      utm_term: existing?.utm_term || body.utm_term || null,
      referrer_url: existing?.referrer_url || body.referrer_url || null,
      landing_page: existing?.landing_page || body.landing_page || null,
      from_page: existing?.from_page || body.from_page || null,
      device_type: existing?.device_type || body.device_type || null,
      user_agent: existing?.user_agent || body.user_agent || null,
      screen_width: existing?.screen_width || body.screen_width || null,
      partner_code: existing?.partner_code || body.partner_code || null,
    }

    const { error } = await supabase
      .from('user_registration_meta')
      .upsert(merged, { onConflict: 'user_id' })

    if (error) {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
