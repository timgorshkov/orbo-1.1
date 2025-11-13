import { redirect } from 'next/navigation'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'
import { cookies } from 'next/headers'
import WelcomeBlock from '@/components/dashboard/welcome-block'
import OnboardingChecklist from '@/components/dashboard/onboarding-checklist'
import AttentionZones from '@/components/dashboard/attention-zones'
import UpcomingEvents from '@/components/dashboard/upcoming-events'
import ActivityTimeline from '@/components/analytics/activity-timeline'
import TopContributors from '@/components/analytics/top-contributors'
import EngagementPie from '@/components/analytics/engagement-pie'
import KeyMetrics from '@/components/analytics/key-metrics'
import ActivityHeatmap from '@/components/analytics/activity-heatmap'

export default async function DashboardPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params
  
  const supabase = await createClientServer()
  const adminSupabase = createAdminServer()

  // Проверяем авторизацию
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect(`/p/${orgId}/auth`)
  }

  // Проверяем роль (только админы могут видеть дашборд)
  const { data: membership } = await adminSupabase
    .from('memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
    // Если не админ, редирект на главную
    redirect(`/p/${orgId}`)
  }

  // Получаем информацию об организации
  const { data: org } = await adminSupabase
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .single()

  if (!org) {
    redirect('/orgs')
  }

  // Получаем данные дашборда через API
  const cookieStore = await cookies()
  const cookieHeader = cookieStore.toString()
  
  const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/dashboard/${orgId}`
  
  let dashboardData
  try {
    const dashboardRes = await fetch(dashboardUrl, { 
      cache: 'no-store',
      headers: {
        'Cookie': cookieHeader
      }
    })
    
    if (!dashboardRes.ok) {
      console.error('Error fetching dashboard data:', await dashboardRes.text())
      throw new Error('Failed to fetch dashboard data')
    }

    dashboardData = await dashboardRes.json()
  } catch (error) {
    console.error('Dashboard fetch error:', error)
    // Fallback data
    dashboardData = {
      isOnboarding: false,
      onboardingStatus: {},
      attentionZones: {
        criticalEvents: [],
        churningParticipants: [],
        inactiveNewcomers: []
      },
      upcomingEvents: []
    }
  }
  
  return (
    <div className="p-6 space-y-6">
      {/* Onboarding Flow */}
      {dashboardData.isOnboarding && (
        <>
          <WelcomeBlock orgName={org.name || 'Пространство'} />
          
          <OnboardingChecklist 
            orgId={orgId}
            status={dashboardData.onboardingStatus}
          />
        </>
      )}

      {/* Main Dashboard for Experienced Users */}
      {!dashboardData.isOnboarding && (
        <>
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">Дашборд</h1>
            <p className="text-neutral-600 mt-1">Обзор активности вашего сообщества</p>
          </div>

          {/* Attention Zones and Upcoming Events - Top Priority */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <AttentionZones 
              orgId={orgId}
              criticalEvents={dashboardData.attentionZones.criticalEvents}
              churningParticipants={dashboardData.attentionZones.churningParticipants}
              inactiveNewcomers={dashboardData.attentionZones.inactiveNewcomers}
            />

            <UpcomingEvents 
              orgId={orgId}
              events={dashboardData.upcomingEvents}
            />
          </div>

          {/* Analytics Section */}
          <div className="space-y-6">
            {/* Activity Timeline - Full Width */}
            <ActivityTimeline orgId={orgId} days={30} />

            {/* Top Contributors and Engagement */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <TopContributors orgId={orgId} limit={10} />
              <EngagementPie orgId={orgId} />
            </div>

            {/* Key Metrics and Activity Heatmap */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <KeyMetrics orgId={orgId} />
              <ActivityHeatmap orgId={orgId} days={60} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

