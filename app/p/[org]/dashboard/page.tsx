import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import WelcomeBlock from '@/components/dashboard/welcome-block'
import OnboardingChecklist from '@/components/dashboard/onboarding-checklist'
import AttentionZones from '@/components/dashboard/attention-zones'
import UpcomingEvents from '@/components/dashboard/upcoming-events'
import ActivityTimeline from '@/components/analytics/activity-timeline'
import TopContributors from '@/components/analytics/top-contributors'
import EngagementPie from '@/components/analytics/engagement-pie'
import KeyMetrics from '@/components/analytics/key-metrics'
import ActivityHeatmap from '@/components/analytics/activity-heatmap'
import { createServiceLogger } from '@/lib/logger'
import { Skeleton } from '@/components/ui/skeleton'

// Loading skeletons for analytics components
function ChartSkeleton() {
  return (
    <div className="bg-white rounded-lg border p-4 space-y-3">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-[200px] w-full" />
    </div>
  )
}

function MetricsSkeleton() {
  return (
    <div className="bg-white rounded-lg border p-4 space-y-3">
      <Skeleton className="h-5 w-24" />
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    </div>
  )
}

export default async function DashboardPage({ params }: { params: Promise<{ org: string }> }) {
  const logger = createServiceLogger('DashboardPage');
  const { org: orgId } = await params
  
  const adminSupabase = createAdminServer()

  // Проверяем авторизацию через unified auth (поддержка Supabase и NextAuth)
  const user = await getUnifiedUser()
  
  if (!user) {
    redirect(`/p/${orgId}/auth`)
  }

  // PARALLEL: Проверяем роль и получаем организацию одновременно
  const [membershipResult, orgResult] = await Promise.all([
    adminSupabase
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .maybeSingle(),
    adminSupabase
      .from('organizations')
      .select('id, name')
      .eq('id', orgId)
      .single()
  ])

  const membership = membershipResult.data
  const org = orgResult.data

  if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
    redirect(`/p/${orgId}`)
  }

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
      const errorText = await dashboardRes.text();
      logger.error({ 
        org_id: orgId,
        status: dashboardRes.status,
        error_text: errorText.substring(0, 200)
      }, 'Error fetching dashboard data');
      throw new Error('Failed to fetch dashboard data')
    }

    dashboardData = await dashboardRes.json()
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      org_id: orgId
    }, 'Dashboard fetch error');
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
              hasMore={dashboardData.attentionZones.hasMore}
            />

            <UpcomingEvents 
              orgId={orgId}
              events={dashboardData.upcomingEvents}
            />
          </div>

          {/* Analytics Section - with Suspense for faster LCP */}
          <div className="space-y-6">
            {/* Activity Timeline - Full Width */}
            <Suspense fallback={<ChartSkeleton />}>
              <ActivityTimeline orgId={orgId} days={30} />
            </Suspense>

            {/* Top Contributors and Engagement */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Suspense fallback={<ChartSkeleton />}>
                <TopContributors orgId={orgId} limit={10} />
              </Suspense>
              <Suspense fallback={<ChartSkeleton />}>
                <EngagementPie orgId={orgId} />
              </Suspense>
            </div>

            {/* Key Metrics and Activity Heatmap */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Suspense fallback={<MetricsSkeleton />}>
                <KeyMetrics orgId={orgId} />
              </Suspense>
              <Suspense fallback={<ChartSkeleton />}>
                <ActivityHeatmap orgId={orgId} days={60} />
              </Suspense>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

