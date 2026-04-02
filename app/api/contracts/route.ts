import { NextRequest, NextResponse } from 'next/server'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'
import { getContractByOrgId, createContract } from '@/lib/services/contractService'
import type { CounterpartyInput, BankAccountInput } from '@/lib/services/contractService'

export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: 'contracts' })
  const orgId = request.nextUrl.searchParams.get('orgId')

  if (!orgId) {
    return NextResponse.json({ error: 'Missing orgId' }, { status: 400 })
  }

  try {
    const user = await getUnifiedUser()
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const roleResult = await getEffectiveOrgRole(user.id, orgId)
    if (!roleResult || !['owner', 'admin'].includes(roleResult.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const contract = await getContractByOrgId(orgId)
    return NextResponse.json({ contract })
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Error getting contract')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: 'contracts' })

  try {
    const user = await getUnifiedUser()
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { orgId, counterparty, bankAccount } = body as {
      orgId: string
      counterparty: CounterpartyInput
      bankAccount: BankAccountInput
    }

    if (!orgId || !counterparty || !bankAccount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const roleResult = await getEffectiveOrgRole(user.id, orgId)
    if (!roleResult || !['owner', 'admin'].includes(roleResult.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check no active contract already exists
    const existing = await getContractByOrgId(orgId)
    if (existing) {
      return NextResponse.json({ error: 'Contract already exists for this organization' }, { status: 409 })
    }

    const { contract, error } = await createContract(orgId, counterparty, bankAccount)

    if (error || !contract) {
      logger.error({ error, org_id: orgId }, 'Failed to create contract')
      return NextResponse.json({ error: error || 'Failed to create contract' }, { status: 500 })
    }

    logger.info({ contract_id: contract.id, org_id: orgId }, 'Contract created via API')
    return NextResponse.json({ contract }, { status: 201 })
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Error creating contract')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
