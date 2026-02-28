import { requireSuperadmin } from '@/lib/server/superadminGuard'
import { createAdminServer } from '@/lib/server/supabaseServer'
import OnboardingTable from '@/components/superadmin/onboarding-table'

export default async function SuperadminOnboardingPage() {
  await requireSuperadmin()

  const supabase = createAdminServer()

  const { data: messages } = await supabase
    .from('onboarding_messages')
    .select('id, user_id, step_key, channel, status, scheduled_at, sent_at, error, created_at')
    .order('scheduled_at', { ascending: true })
    .limit(2000)

  if (!messages || messages.length === 0) {
    return (
      <div>
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Онбординг-цепочки</h2>
          <p className="text-gray-600 mt-1">Нет отправленных сообщений</p>
        </div>
      </div>
    )
  }

  const userIds = [...new Set(messages.map(m => m.user_id))]

  const [{ data: users }, { data: tgAccounts }] = await Promise.all([
    supabase.from('users').select('id, email, name').in('id', userIds),
    supabase
      .from('user_telegram_accounts')
      .select('user_id, telegram_username, telegram_first_name, telegram_last_name')
      .in('user_id', userIds),
  ])

  const userMap = new Map<string, { email: string; name: string; tgUsername: string | null }>()
  for (const u of users || []) {
    const tg = (tgAccounts || []).find(t => t.user_id === u.id)
    const tgName = tg
      ? [tg.telegram_first_name, tg.telegram_last_name].filter(Boolean).join(' ')
      : null
    userMap.set(u.id, {
      email: u.email || '',
      name: u.name || tgName || '',
      tgUsername: tg?.telegram_username || null,
    })
  }

  const formatted = messages.map(m => {
    const user = userMap.get(m.user_id)
    return {
      id: m.id,
      userId: m.user_id,
      userName: user?.name || '',
      userEmail: user?.email || '',
      tgUsername: user?.tgUsername || null,
      stepKey: m.step_key,
      channel: m.channel as 'email' | 'telegram',
      status: m.status as 'pending' | 'sent' | 'skipped' | 'failed',
      scheduledAt: m.scheduled_at,
      sentAt: m.sent_at,
      error: m.error,
    }
  })

  const stats = {
    total: formatted.length,
    sent: formatted.filter(m => m.status === 'sent').length,
    pending: formatted.filter(m => m.status === 'pending').length,
    skipped: formatted.filter(m => m.status === 'skipped').length,
    failed: formatted.filter(m => m.status === 'failed').length,
    uniqueUsers: userIds.length,
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Онбординг-цепочки</h2>
        <p className="text-gray-600 mt-1">
          {stats.uniqueUsers} пользователей · {stats.total} сообщений
          (✅ {stats.sent} · ⏳ {stats.pending} · ⏭ {stats.skipped} · ❌ {stats.failed})
        </p>
      </div>

      <OnboardingTable messages={formatted} />
    </div>
  )
}
