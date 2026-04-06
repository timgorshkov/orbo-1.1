import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { requireSuperadmin } from '@/lib/server/superadminGuard'
import { createAPILogger } from '@/lib/logger'

// GET /api/superadmin/partners — list all partners with user counts
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: 'superadmin/partners' })
  await requireSuperadmin()
  const db = createAdminServer()

  const { data: partners, error } = await db
    .from('partners')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    logger.error({ error: error.message }, 'Failed to fetch partners')
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Get user counts per partner code
  const codes = (partners ?? []).map(p => p.code).filter(Boolean)
  let countMap: Record<string, number> = {}
  if (codes.length > 0) {
    const { data: metaRows } = await db
      .from('user_registration_meta')
      .select('partner_code')
      .in('partner_code', codes)

    for (const row of metaRows ?? []) {
      if (row.partner_code) {
        countMap[row.partner_code] = (countMap[row.partner_code] ?? 0) + 1
      }
    }
  }

  const result = (partners ?? []).map(p => ({
    ...p,
    user_count: countMap[p.code] ?? 0,
  }))

  return NextResponse.json({ partners: result })
}

// POST /api/superadmin/partners — create partner
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: 'superadmin/partners' })
  await requireSuperadmin()

  const body = await request.json()
  const { name, email, contact, code, notes } = body

  if (!name || !code) {
    return NextResponse.json({ error: 'name and code are required' }, { status: 400 })
  }

  // Validate code: alphanumeric + hyphens, 2-32 chars
  if (!/^[a-zA-Z0-9_-]{2,32}$/.test(code)) {
    return NextResponse.json(
      { error: 'Код должен содержать только буквы, цифры, дефисы и подчёркивания (2–32 символа)' },
      { status: 400 }
    )
  }

  const db = createAdminServer()
  const { data, error } = await db
    .from('partners')
    .insert({ name, email: email || null, contact: contact || null, code, notes: notes || null })

  if (error) {
    if (error.message?.includes('unique') || error.code === '23505') {
      return NextResponse.json({ error: 'Партнёр с таким кодом уже существует' }, { status: 409 })
    }
    logger.error({ error: error.message }, 'Failed to create partner')
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  logger.info({ code, name }, 'Partner created')
  return NextResponse.json({ partner: data?.[0] ?? null }, { status: 201 })
}
