import { NextRequest, NextResponse } from 'next/server'
import { createAPILogger } from '@/lib/logger'
import { requireSuperadmin } from '@/lib/server/superadminGuard'
import {
  getContractById,
  updateContractStatus,
  updateCounterparty,
  updateBankAccount,
} from '@/lib/services/contractService'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: 'superadmin/contracts/[id]' })
  const { id } = await params

  try {
    await requireSuperadmin()
    const contract = await getContractById(id)
    if (!contract) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ contract })
  } catch (error: any) {
    if (error?.message === 'NEXT_REDIRECT') throw error
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Error getting contract')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: 'superadmin/contracts/[id]' })
  const { id } = await params

  try {
    await requireSuperadmin()

    const contract = await getContractById(id)
    if (!contract) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const body = await request.json()

    // Update contract status
    if (body.contract?.status) {
      const { error } = await updateContractStatus(id, body.contract.status)
      if (error) return NextResponse.json({ error }, { status: 500 })
    }

    // Update counterparty fields
    if (body.counterparty && Object.keys(body.counterparty).length > 0) {
      const { error } = await updateCounterparty(contract.counterparty.id, body.counterparty)
      if (error) return NextResponse.json({ error }, { status: 500 })
    }

    // Update bank account
    if (body.bankAccount && Object.keys(body.bankAccount).length > 0) {
      const { error } = await updateBankAccount(contract.bank_account.id, body.bankAccount)
      if (error) return NextResponse.json({ error }, { status: 500 })
    }

    const updated = await getContractById(id)
    logger.info({ contract_id: id }, 'Contract updated by superadmin')
    return NextResponse.json({ contract: updated })
  } catch (error: any) {
    if (error?.message === 'NEXT_REDIRECT') throw error
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Error updating contract')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
