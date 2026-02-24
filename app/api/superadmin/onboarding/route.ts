import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { processOnboardingMessages } from '@/lib/services/onboardingChainService'

export async function GET(request: NextRequest) {
  const user = await getUnifiedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminServer()

  const now = new Date().toISOString()

  const [
    { data: allMessages },
    { data: overdueMessages },
    { data: recentSent },
    { data: recentActivity },
  ] = await Promise.all([
    supabase
      .from('onboarding_messages')
      .select('id, status, channel, step_key, scheduled_at, sent_at, error')
      .order('created_at', { ascending: false })
      .limit(1000),
    supabase
      .from('onboarding_messages')
      .select('id, user_id, step_key, channel, scheduled_at, error')
      .eq('status', 'pending')
      .lte('scheduled_at', now),
    supabase
      .from('onboarding_messages')
      .select('sent_at')
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })
      .limit(1),
    supabase
      .from('onboarding_messages')
      .select('sent_at')
      .in('status', ['sent', 'skipped'])
      .order('sent_at', { ascending: false })
      .limit(1),
  ])

  const msgs = allMessages || []
  const overdue = overdueMessages || []
  const lastSent = recentSent?.[0]?.sent_at || null

  const statusCounts = {
    total: msgs.length,
    pending: msgs.filter(m => m.status === 'pending').length,
    sent: msgs.filter(m => m.status === 'sent').length,
    skipped: msgs.filter(m => m.status === 'skipped').length,
    failed: msgs.filter(m => m.status === 'failed').length,
  }

  const overdueByStep: Record<string, number> = {}
  let maxOverdueHours = 0
  for (const m of overdue) {
    overdueByStep[m.step_key] = (overdueByStep[m.step_key] || 0) + 1
    const hoursOverdue = (Date.now() - new Date(m.scheduled_at).getTime()) / (1000 * 60 * 60)
    if (hoursOverdue > maxOverdueHours) maxOverdueHours = hoursOverdue
  }

  const failedMessages = msgs.filter(m => m.status === 'failed')
  const failedErrors: Record<string, number> = {}
  for (const m of failedMessages) {
    const err = m.error || 'Unknown error'
    failedErrors[err] = (failedErrors[err] || 0) + 1
  }

  const lastActivity = recentActivity?.[0]?.sent_at || null

  let cronRunning = false
  if (overdue.length === 0) {
    cronRunning = true
  } else if (lastSent || lastActivity) {
    const latestTimestamp = lastSent && lastActivity
      ? new Date(Math.max(new Date(lastSent).getTime(), new Date(lastActivity).getTime()))
      : new Date((lastSent || lastActivity)!)
    const hoursSinceActivity = (Date.now() - latestTimestamp.getTime()) / (1000 * 60 * 60)
    cronRunning = hoursSinceActivity < 2
  }

  const hasFuturePending = msgs.some(m =>
    m.status === 'pending' && new Date(m.scheduled_at) > new Date()
  )
  if (cronRunning && overdue.length === 0 && !hasFuturePending && statusCounts.pending === 0) {
    cronRunning = true
  }

  const diagnosis: string[] = []
  if (overdue.length > 0 && !cronRunning) {
    diagnosis.push(`🔴 Крон send-onboarding не работает. ${overdue.length} сообщений просрочены (макс. ${Math.round(maxOverdueHours)} ч.)`)
    diagnosis.push('Вероятная причина: скрипт cron-send-onboarding.sh не работает (проверьте CRLF / права / crontab)')
    diagnosis.push('Решение: подключитесь к серверу и запустите: sed -i \'s/\\r$//\' ~/orbo/cron-send-onboarding.sh && bash ~/orbo/scripts/setup-cron.sh')
  }
  if (overdue.length > 0 && cronRunning) {
    diagnosis.push(`⚠️ Крон работает, но есть ${overdue.length} просроченных сообщений. Возможно, processOnboardingMessages обрабатывает только 20 за раз.`)
  }
  if (failedMessages.length > 0) {
    diagnosis.push(`❌ ${failedMessages.length} сообщений завершились с ошибкой`)
    for (const [err, count] of Object.entries(failedErrors)) {
      diagnosis.push(`   • ${err} (×${count})`)
    }
  }
  if (statusCounts.total === 0) {
    diagnosis.push('ℹ️ В таблице нет записей. scheduleOnboardingChain не вызывался ни разу.')
  }
  if (statusCounts.pending === 0 && overdue.length === 0 && statusCounts.sent > 0) {
    diagnosis.push('✅ Все запланированные сообщения обработаны.')
  }
  if (overdue.length === 0 && hasFuturePending) {
    diagnosis.push(`✅ Крон в порядке. ${msgs.filter(m => m.status === 'pending').length} сообщений ожидают отправки по расписанию.`)
  }
  if (overdue.length === 0 && !hasFuturePending && statusCounts.total > 0 && statusCounts.pending === 0) {
    diagnosis.push('✅ Все сообщения обработаны, новых запланированных нет.')
  }

  return NextResponse.json({
    statusCounts,
    overdue: {
      count: overdue.length,
      byStep: overdueByStep,
      maxOverdueHours: Math.round(maxOverdueHours),
    },
    failedErrors,
    lastSentAt: lastSent,
    cronRunning,
    diagnosis,
  })
}

export async function POST(request: NextRequest) {
  const user = await getUnifiedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const stats = await processOnboardingMessages()
    return NextResponse.json({ success: true, ...stats })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }
}
