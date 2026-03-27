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

    // Single query: fetch registrations with payment_status included
    const { data: registrations, error: regError } = await adminSupabase
      .from('event_registrations')
      .select('registered_at, payment_status')
      .in('event_id', eventIds)
      .gte('registered_at', startDate.toISOString())
      .lte('registered_at', endDate.toISOString())
      .order('registered_at', { ascending: true })

    if (regError) {
      logger.error({ error: regError, orgId }, 'Failed to fetch event registrations')
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    const dateArray: string[] = []
    const currentDate = new Date(startDate)
    while (currentDate <= endDate) {
      dateArray.push(currentDate.toISOString().split('T')[0])
      currentDate.setDate(currentDate.getDate() + 1)
    }

    const dataMap: { [key: string]: { registrations: number; payments: number } } = {}
    dateArray.forEach(date => {
      dataMap[date] = { registrations: 0, payments: 0 }
    })

    let totalPayments = 0
    registrations?.forEach(reg => {
      const date = new Date(reg.registered_at).toISOString().split('T')[0]
      if (dataMap[date]) {
        dataMap[date].registrations++
        if (reg.payment_status === 'paid') {
          dataMap[date].payments++
          totalPayments++
        }
      }
    })

    const data = dateArray.map(date => ({
      date,
      registrations: dataMap[date].registrations,
      payments: dataMap[date].payments
    }))

    return NextResponse.json({
      data,
      totals: {
        registrations: registrations?.length || 0,
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
