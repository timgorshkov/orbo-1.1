import { NextRequest, NextResponse } from 'next/server'
import { createAPILogger } from '@/lib/logger'
import { requireSuperadmin } from '@/lib/server/superadminGuard'
import { sendSubscriptionActToElba } from '@/lib/services/subscriptionActElbaSync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/superadmin/accounting/subscription-act/[id]/resend
 *
 * Повторная отправка акта лицензии (АЛ) в Контур.Эльбу. Вызывается из UI
 * суперадминки для документов с elba_sync_status='failed' — или для записей,
 * созданных до подключения автосинхронизации.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, {
    endpoint: 'superadmin/accounting/subscription-act/[id]/resend',
  })
  const { id } = await params

  try {
    await requireSuperadmin()
    const result = await sendSubscriptionActToElba(id)
    logger.info(
      { doc_id: id, status: result.status, error: result.error },
      'Subscription act resend to Elba requested'
    )
    return NextResponse.json(result)
  } catch (error: any) {
    if (error?.message === 'NEXT_REDIRECT') throw error
    logger.error(
      { doc_id: id, error: error instanceof Error ? error.message : String(error) },
      'Error in subscription-act resend'
    )
    return NextResponse.json(
      { error: error?.message || 'Internal error' },
      { status: 500 }
    )
  }
}
