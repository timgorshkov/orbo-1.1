import { requireOrgAccess } from '@/lib/orgGuard'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import '../../../globals.css'
import { getOrgInfoWithClient } from '@/lib/getOrgInfo'
import WelcomeBlock from '@/components/dashboard/welcome-block'
import OnboardingChecklist from '@/components/dashboard/onboarding-checklist'
import ActivityChart from '@/components/dashboard/activity-chart'
import AttentionZones from '@/components/dashboard/attention-zones'
import UpcomingEvents from '@/components/dashboard/upcoming-events'

type ActivityEvent = {
  id: number;
  type: 'join' | 'leave' | 'message' | 'checkin';
  created_at: string;
  participant: { id: string; full_name: string; username: string | null };
};

type DashboardStats = {
  total_participants: number;
  new_7d: number;
  left_7d: number;
};

export default async function Dashboard({ params }: { params: { org: string } }) {
  try {
    const { supabase } = await requireOrgAccess(params.org)
    
    // Получаем информацию об организации
    const orgInfo = await getOrgInfoWithClient(supabase, params.org)

    // Получаем данные дашборда через API
    const cookieStore = cookies()
    const cookieHeader = cookieStore.toString()
    
    const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/dashboard/${params.org}`
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

    const dashboardData = await dashboardRes.json()
    
    return (
      <div className="p-6 space-y-6">
          {/* Onboarding Flow */}
          {dashboardData.isOnboarding && (
            <>
              <WelcomeBlock orgName={orgInfo?.name || 'Пространство'} />
              
              <OnboardingChecklist 
                orgId={params.org}
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

              {/* Activity Chart */}
              <ActivityChart 
                data={dashboardData.metrics.activityChart}
                totalParticipants={dashboardData.metrics.totalParticipants}
              />

              {/* Attention Zones and Upcoming Events */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <AttentionZones 
                  orgId={params.org}
                  criticalEvents={dashboardData.attentionZones.criticalEvents}
                  churningParticipants={dashboardData.attentionZones.churningParticipants}
                  inactiveNewcomers={dashboardData.attentionZones.inactiveNewcomers}
                />

                <UpcomingEvents 
                  orgId={params.org}
                  events={dashboardData.upcomingEvents}
                />
              </div>
            </>
          )}
      </div>
    )
  } catch (error) {
    console.error('Dashboard error:', error)
    return notFound()
  }
}
