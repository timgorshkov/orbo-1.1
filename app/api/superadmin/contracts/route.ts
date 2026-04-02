import { NextRequest, NextResponse } from 'next/server'
import { createAPILogger } from '@/lib/logger'
import { requireSuperadmin } from '@/lib/server/superadminGuard'
import { listContracts } from '@/lib/services/contractService'

export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: 'superadmin/contracts' })

  try {
    await requireSuperadmin()

    const status = request.nextUrl.searchParams.get('status') || undefined
    const contracts = await listContracts(status ? { status } : undefined)

    return NextResponse.json({ contracts })
  } catch (error: any) {
    if (error?.message === 'NEXT_REDIRECT') throw error
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Error listing contracts')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
