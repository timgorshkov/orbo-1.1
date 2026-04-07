import { NextRequest, NextResponse } from 'next/server'
import { createAPILogger } from '@/lib/logger'
import { isSuperadmin } from '@/lib/server/superadminGuard'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getWithdrawals } from '@/lib/services/withdrawalService'

export const dynamic = 'force-dynamic'

// GET /api/superadmin/withdrawals?status=...&orgId=...&page=...&pageSize=...
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: 'superadmin/withdrawals' })

  try {
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isAdmin = await isSuperadmin()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const status = request.nextUrl.searchParams.get('status') || undefined
    const orgId = request.nextUrl.searchParams.get('orgId') || undefined
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1')
    const pageSize = Math.min(parseInt(request.nextUrl.searchParams.get('pageSize') || '20'), 100)
    const dateFrom = request.nextUrl.searchParams.get('dateFrom') || undefined
    const dateTo = request.nextUrl.searchParams.get('dateTo') || undefined

    const result = await getWithdrawals({
      status: status as any,
      orgId,
      dateFrom,
      dateTo,
      page,
      pageSize,
    })

    return NextResponse.json(result)
  } catch (error: any) {
    if (error?.message === 'NEXT_REDIRECT') throw error
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Error listing withdrawals')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
