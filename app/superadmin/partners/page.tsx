import { requireSuperadmin } from '@/lib/server/superadminGuard'
import { createAdminServer } from '@/lib/server/supabaseServer'
import PartnersClient from './partners-client'

export default async function SuperadminPartnersPage() {
  await requireSuperadmin()
  const db = createAdminServer()

  const { data: partners } = await db
    .from('partners')
    .select('*')
    .order('created_at', { ascending: false })

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

  const partnersWithStats = (partners ?? []).map(p => ({
    ...p,
    user_count: countMap[p.code] ?? 0,
  }))

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Партнёры</h2>
        <p className="text-gray-600 mt-1">
          Партнёрская программа. Реферальные ссылки: <code className="bg-gray-100 px-1 rounded text-sm">orbo.ru/pricing?via=КОД</code>
        </p>
      </div>
      <PartnersClient initialPartners={partnersWithStats} />
    </div>
  )
}
