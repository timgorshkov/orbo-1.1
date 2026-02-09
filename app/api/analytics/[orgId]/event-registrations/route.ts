import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('EventRegistrationsAPI')

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params
    const searchParams = request.nextUrl.searchParams
    const days = parseInt(searchParams.get('days') || '30')

    // Auth check
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminSupabase = createAdminServer()

    // Verify user has access to org (with superadmin fallback)
    const { getEffectiveOrgRole } = await import('@/lib/server/orgAccess')
    const access = await getEffectiveOrgRole(user.id, orgId)

    if (!access) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // First, get all event IDs for this org
    const { data: orgEvents, error: eventsError } = await adminSupabase
      .from('events')
      .select('id')
      .eq('org_id', orgId)

    if (eventsError) {
      logger.error({ error: eventsError, orgId }, 'Failed to fetch org events')
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    const eventIds = orgEvents?.map(e => e.id) || []
    
    // If no events, return empty data
    if (eventIds.length === 0) {
      const dateArray: string[] = []
      const currentDate = new Date(startDate)
      while (currentDate <= endDate) {
        dateArray.push(currentDate.toISOString().split('T')[0])
        currentDate.setDate(currentDate.getDate() + 1)
      }
      const emptyData = dateArray.map(date => ({
        date,
        registrations: 0,
        payments: 0
      }))
      return NextResponse.json({
        data: emptyData,
        totals: { registrations: 0, payments: 0 }
      })
    }

    // Get registrations count by date
    const { data: registrations, error: regError } = await adminSupabase
      .from('event_registrations')
      .select('registered_at, event_id')
      .in('event_id', eventIds)
      .gte('registered_at', startDate.toISOString())
      .lte('registered_at', endDate.toISOString())
      .order('registered_at', { ascending: true })

    if (regError) {
      logger.error({ error: regError, orgId }, 'Failed to fetch event registrations')
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    // Get payments count by date
    const { data: payments, error: payError } = await adminSupabase
      .from('event_registrations')
      .select('registered_at, payment_status, event_id')
      .in('event_id', eventIds)
      .eq('payment_status', 'paid')
      .gte('registered_at', startDate.toISOString())
      .lte('registered_at', endDate.toISOString())
      .order('registered_at', { ascending: true })

    if (payError) {
      logger.error({ error: payError, orgId }, 'Failed to fetch event payments')
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    // Create date array for all days in range
    const dateArray: string[] = []
    const currentDate = new Date(startDate)
    while (currentDate <= endDate) {
      dateArray.push(currentDate.toISOString().split('T')[0])
      currentDate.setDate(currentDate.getDate() + 1)
    }

    // Aggregate data by date
    const dataMap: { [key: string]: { registrations: number; payments: number } } = {}
    dateArray.forEach(date => {
      dataMap[date] = { registrations: 0, payments: 0 }
    })

    // Count registrations per day
    registrations?.forEach(reg => {
      const date = new Date(reg.registered_at).toISOString().split('T')[0]
      if (dataMap[date]) {
        dataMap[date].registrations++
      }
    })

    // Count payments per day
    payments?.forEach(pay => {
      const date = new Date(pay.registered_at).toISOString().split('T')[0]
      if (dataMap[date]) {
        dataMap[date].payments++
      }
    })

    // Convert to array format
    const data = dateArray.map(date => ({
      date,
      registrations: dataMap[date].registrations,
      payments: dataMap[date].payments
    }))

    // Calculate totals
    const totalRegistrations = registrations?.length || 0
    const totalPayments = payments?.length || 0

    return NextResponse.json({
      data,
      totals: {
        registrations: totalRegistrations,
        payments: totalPayments
      }
    })
  } catch (error: any) {
    logger.error({ error: error.message }, 'Event registrations API error')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
