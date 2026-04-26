import { NextRequest, NextResponse } from 'next/server'
import { createAPILogger } from '@/lib/logger'
import { isSuperadmin } from '@/lib/server/superadminGuard'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import {
  getWithdrawalById,
  processWithdrawal,
  completeWithdrawal,
  rejectWithdrawal,
  generateWithdrawalAct,
} from '@/lib/services/withdrawalService'

export const dynamic = 'force-dynamic'

// GET /api/superadmin/withdrawals/[id] — get withdrawal details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: 'superadmin/withdrawals/[id]' })
  const { id } = await params

  try {
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isAdmin = await isSuperadmin()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const withdrawal = await getWithdrawalById(id)
    if (!withdrawal) {
      return NextResponse.json({ error: 'Withdrawal not found' }, { status: 404 })
    }

    return NextResponse.json({ withdrawal })
  } catch (error: any) {
    if (error?.message === 'NEXT_REDIRECT') throw error
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Error getting withdrawal')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// PATCH /api/superadmin/withdrawals/[id] — process, complete, reject, generate-act
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: 'superadmin/withdrawals/[id]' })
  const { id } = await params

  try {
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isAdmin = await isSuperadmin()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { action, reason } = body

    if (!action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 })
    }

    let withdrawal

    switch (action) {
      case 'process':
        withdrawal = await processWithdrawal(id, user.id)
        break

      case 'complete':
        withdrawal = await completeWithdrawal(id, user.id)
        break

      case 'reject':
        if (!reason) {
          return NextResponse.json({ error: 'reason is required for rejection' }, { status: 400 })
        }
        withdrawal = await rejectWithdrawal(id, user.id, reason)
        break

      case 'generate-act': {
        const url = await generateWithdrawalAct(id)
        return NextResponse.json({ url })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }

    return NextResponse.json({ withdrawal })
  } catch (error: any) {
    if (error?.message === 'NEXT_REDIRECT') throw error
    logger.error({ error: error instanceof Error ? error.message : String(error), withdrawal_id: id }, 'Error updating withdrawal')

    // Return user-facing errors
    if (error.message.includes('Not found') || error.message.includes('wrong status') || error.message.includes('Cannot reject')) {
      return NextResponse.json({ error: 'Bad request' }, { status: 400 })
    }

    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
