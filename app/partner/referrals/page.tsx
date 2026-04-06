import { requirePartner } from '@/lib/server/partnerGuard'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'
import { Users } from 'lucide-react'

export const dynamic = 'force-dynamic'

const logger = createServiceLogger('PartnerReferrals')

interface ReferralUser {
  user_id: string
  user_name: string | null
  user_email: string | null
  registered_at: string
  organizations: Array<{
    id: string
    name: string
    plan: string | null
    created_at: string
  }>
}

export default async function PartnerReferralsPage() {
  const partner = await requirePartner()
  const db = createAdminServer()

  // Получаем пользователей, зарегистрированных по коду партнёра
  const { data: registrations, error: regError } = await db
    .from('user_registration_meta')
    .select('user_id, created_at')
    .eq('partner_code', partner.code)
    .order('created_at', { ascending: false })

  if (regError) {
    logger.error({ error: regError.message, partner_code: partner.code }, 'Error fetching referral registrations')
  }

  const referrals: ReferralUser[] = []

  if (registrations && registrations.length > 0) {
    const userIds = registrations.map(r => r.user_id)

    // Получаем данные пользователей
    const { data: users } = await db
      .from('users')
      .select('id, name, email')
      .in('id', userIds)

    const usersMap = new Map((users as any[])?.map(u => [u.id, u]) || [])

    // Получаем организации пользователей (owner role)
    const { data: memberships } = await db
      .from('memberships')
      .select('user_id, org_id')
      .in('user_id', userIds)
      .eq('role', 'owner')

    const orgIds = Array.from(new Set(memberships?.map((m: any) => m.org_id) || []))
    let orgsMap = new Map<string, { id: string; name: string; created_at: string }>()
    let subsMap = new Map<string, string>()

    if (orgIds.length > 0) {
      const { data: orgs } = await db
        .from('organizations')
        .select('id, name, created_at')
        .in('id', orgIds)

      orgsMap = new Map((orgs as any[])?.map(o => [o.id, o]) || [])

      // Получаем подписки
      const { data: subs } = await db
        .from('org_subscriptions')
        .select('org_id, plan_code')
        .in('org_id', orgIds)
        .eq('status', 'active')

      subs?.forEach(s => subsMap.set(s.org_id, s.plan_code))
    }

    // Собираем данные
    for (const reg of registrations) {
      const user = usersMap.get(reg.user_id)
      const userMemberships = memberships?.filter(m => m.user_id === reg.user_id) || []
      const userOrgs = userMemberships
        .map(m => {
          const org = orgsMap.get(m.org_id)
          if (!org) return null
          return {
            id: org.id,
            name: org.name,
            plan: subsMap.get(org.id) || 'free',
            created_at: org.created_at,
          }
        })
        .filter(Boolean) as ReferralUser['organizations']

      referrals.push({
        user_id: reg.user_id,
        user_name: user?.name || null,
        user_email: user?.email || null,
        registered_at: reg.created_at,
        organizations: userOrgs,
      })
    }
  }

  const totalUsers = referrals.length
  const usersWithOrgs = referrals.filter(r => r.organizations.length > 0).length
  const paidOrgs = referrals.reduce(
    (sum, r) => sum + r.organizations.filter(o => o.plan !== 'free').length,
    0
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Рефералы</h2>
        <p className="mt-1 text-gray-600">
          Пользователи, зарегистрированные по вашей партнёрской ссылке
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg bg-white border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Всего регистраций</p>
          <p className="text-2xl font-bold text-gray-900">{totalUsers}</p>
        </div>
        <div className="rounded-lg bg-white border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Создали пространство</p>
          <p className="text-2xl font-bold text-gray-900">{usersWithOrgs}</p>
        </div>
        <div className="rounded-lg bg-white border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Платных подписок</p>
          <p className="text-2xl font-bold text-emerald-600">{paidOrgs}</p>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg bg-white border border-gray-200 overflow-hidden">
        {referrals.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Пока нет зарегистрированных рефералов</p>
            <p className="text-sm text-gray-400 mt-1">
              Поделитесь реферальной ссылкой, чтобы привлечь первых пользователей
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Пользователь</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Email</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Дата регистрации</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Организации</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Тариф</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {referrals.map((referral) => (
                  <tr key={referral.user_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">
                      {referral.user_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {referral.user_email || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(referral.registered_at).toLocaleDateString('ru-RU')}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {referral.organizations.length > 0
                        ? referral.organizations.map(o => o.name).join(', ')
                        : <span className="text-gray-400">Нет</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      {referral.organizations.length > 0
                        ? referral.organizations.map((o, i) => (
                            <span
                              key={o.id}
                              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                                o.plan !== 'free'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-gray-100 text-gray-600'
                              } ${i > 0 ? 'ml-1' : ''}`}
                            >
                              {o.plan || 'free'}
                            </span>
                          ))
                        : <span className="text-gray-400">—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
