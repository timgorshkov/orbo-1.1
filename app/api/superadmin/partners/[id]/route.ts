import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { requireSuperadmin } from '@/lib/server/superadminGuard'
import { createAPILogger } from '@/lib/logger'

// PATCH /api/superadmin/partners/[id] — update partner
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: 'superadmin/partners/[id]' })
  await requireSuperadmin()
  const { id } = await params

  const body = await request.json()
  const { name, email, contact, code, notes, is_active } = body

  if (code && !/^[a-zA-Z0-9_-]{2,32}$/.test(code)) {
    return NextResponse.json(
      { error: 'Код должен содержать только буквы, цифры, дефисы и подчёркивания (2–32 символа)' },
      { status: 400 }
    )
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (name !== undefined) update.name = name
  if (email !== undefined) update.email = email || null
  if (contact !== undefined) update.contact = contact || null
  if (code !== undefined) update.code = code
  if (notes !== undefined) update.notes = notes || null
  if (is_active !== undefined) update.is_active = is_active

  const db = createAdminServer()
  const { error } = await db
    .from('partners')
    .update(update)
    .eq('id', id)

  if (error) {
    if (error.message?.includes('unique') || error.code === '23505') {
      return NextResponse.json({ error: 'Партнёр с таким кодом уже существует' }, { status: 409 })
    }
    logger.error({ error: error.message, id }, 'Failed to update partner')
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
