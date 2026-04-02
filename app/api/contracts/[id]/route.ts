import { NextRequest, NextResponse } from 'next/server'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getContractById } from '@/lib/services/contractService'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: 'contracts/[id]' })
  const { id } = await params

  try {
    const user = await getUnifiedUser()
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const contract = await getContractById(id)
    if (!contract) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ contract })
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Error getting contract')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
