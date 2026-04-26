import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { resendActToElba } from '@/lib/services/retailActService'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/superadmin/accounting/retail-act/[id]/resend
 *
 * Повторяет отправку акта в Эльбу. Используется когда первая попытка упала
 * (сеть, авторизация, невалидный контрагент) — документ в БД уже есть,
 * нужно только вновь создать его в Эльбе и получить ссылку.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const logger = createAPILogger(request, {
    endpoint: '/api/superadmin/accounting/retail-act/[id]/resend',
  })

  try {
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const db = createAdminServer()
    const { data: superadminRow } = await db
      .from('superadmins')
      .select('user_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()
    if (!superadminRow) {
      return NextResponse.json({ error: 'Superadmin access required' }, { status: 403 })
    }

    const result = await resendActToElba(params.id)
    logger.info(
      { doc_id: params.id, elba_sync_status: result.elbaSyncStatus, user_id: user.id },
      'Retail act resend to Elba requested'
    )
    return NextResponse.json(result)
  } catch (err: any) {
    logger.error(
      { error: err.message, stack: err.stack, docId: params.id },
      'Error in POST retail-act/[id]/resend'
    )
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
