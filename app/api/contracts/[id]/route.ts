import { NextRequest, NextResponse } from 'next/server'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'
import { getContractById, generateVerificationInvoice } from '@/lib/services/contractService'

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

    const role = await getEffectiveOrgRole(user.id, contract.org_id)
    if (!role || !['owner', 'admin'].includes(role.role)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ contract })
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Error getting contract')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// POST /api/contracts/[id] — actions on contract (e.g. generate invoice)
export async function POST(
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

    // Check org access
    const role = await getEffectiveOrgRole(user.id, contract.org_id)
    if (!role || !['owner', 'admin'].includes(role.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()

    if (body.action === 'generate-invoice') {
      const url = await generateVerificationInvoice(id)
      return NextResponse.json({ url })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Error with contract action')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
