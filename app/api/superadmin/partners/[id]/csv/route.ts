import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { requireSuperadmin } from '@/lib/server/superadminGuard'
import { createAPILogger } from '@/lib/logger'

// GET /api/superadmin/partners/[id]/csv
// Returns a CSV with orgs created by users referred by this partner
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: 'superadmin/partners/[id]/csv' })
  await requireSuperadmin()
  const { id } = await params
  const db = createAdminServer()

  // Get partner
  const { data: partner, error: partnerError } = await db
    .from('partners')
    .select('id, name, code')
    .eq('id', id)
    .single()

  if (partnerError || !partner) {
    return NextResponse.json({ error: 'Partner not found' }, { status: 404 })
  }

  // Get all users referred by this partner
  const { data: metaRows, error: metaError } = await db
    .from('user_registration_meta')
    .select('user_id, partner_code, created_at')
    .eq('partner_code', partner.code)

  if (metaError) {
    logger.error({ error: metaError.message }, 'Failed to fetch referred users')
    return NextResponse.json({ error: metaError.message }, { status: 500 })
  }

  if (!metaRows || metaRows.length === 0) {
    const csv = 'Пользователь,Email,Организация,Дата создания орг.,Тариф\n'
    return csvResponse(csv, partner.code)
  }

  const userIds = metaRows.map(r => r.user_id)

  // Get users info
  const { data: users } = await db
    .from('users')
    .select('id, email, name')
    .in('id', userIds)

  type UserRow = { id: string; email: string | null; name: string | null }
  type MembershipRow = { user_id: string; org_id: string; role: string }
  type OrgRow = { id: string; name: string | null; created_at: string; plan: string | null }
  type SubRow = { org_id: string; plan_code: string; status: string }

  const userMap = new Map(((users ?? []) as UserRow[]).map(u => [u.id, u]))

  // Get memberships (owner role = created the org)
  const { data: memberships } = await db
    .from('memberships')
    .select('user_id, org_id, role')
    .in('user_id', userIds)
    .eq('role', 'owner')

  const orgIds = Array.from(new Set(((memberships ?? []) as MembershipRow[]).map(m => m.org_id)))

  // Get orgs with plan info
  const { data: orgs } = orgIds.length > 0
    ? await db.from('organizations').select('id, name, created_at, plan').in('id', orgIds)
    : { data: [] }

  // Get active subscriptions
  const { data: subs } = orgIds.length > 0
    ? await db
        .from('org_subscriptions')
        .select('org_id, plan_code, status')
        .in('org_id', orgIds)
        .eq('status', 'active')
    : { data: [] }

  const subsMap = new Map(((subs ?? []) as SubRow[]).map(s => [s.org_id, s]))
  const orgMap = new Map(((orgs ?? []) as OrgRow[]).map(o => [o.id, o]))
  const membershipsByUser = new Map<string, string[]>()
  for (const m of (memberships ?? []) as MembershipRow[]) {
    if (!membershipsByUser.has(m.user_id)) membershipsByUser.set(m.user_id, [])
    membershipsByUser.get(m.user_id)!.push(m.org_id)
  }

  // Build rows
  const csvRows: string[][] = []
  csvRows.push(['Пользователь', 'Email', 'Дата регистрации', 'Организация', 'Дата создания орг.', 'Тариф'])

  for (const meta of metaRows) {
    const user = userMap.get(meta.user_id)
    const userOrgIds = membershipsByUser.get(meta.user_id) ?? []
    const regDate = new Date(meta.created_at).toLocaleDateString('ru-RU')

    if (userOrgIds.length === 0) {
      csvRows.push([
        user?.name || '',
        user?.email || '',
        regDate,
        '—',
        '—',
        '—',
      ])
    } else {
      for (const orgId of userOrgIds) {
        const org = orgMap.get(orgId)
        const sub = subsMap.get(orgId)
        const plan = sub?.plan_code || org?.plan || 'free'
        const orgCreated = org?.created_at ? new Date(org.created_at).toLocaleDateString('ru-RU') : '—'
        csvRows.push([
          user?.name || '',
          user?.email || '',
          regDate,
          org?.name || orgId,
          orgCreated,
          plan,
        ])
      }
    }
  }

  const escape = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = '\uFEFF' + csvRows.map(row => row.map(escape).join(',')).join('\n')

  return csvResponse(csv, partner.code)
}

function csvResponse(csv: string, partnerCode: string) {
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="partner-${partnerCode}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
