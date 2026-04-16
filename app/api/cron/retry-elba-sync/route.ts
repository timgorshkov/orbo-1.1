import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { sendSubscriptionActToElba } from '@/lib/services/subscriptionActElbaSync'
import { resendActToElba as resendRetailActToElba } from '@/lib/services/retailActService'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * GET /api/cron/retry-elba-sync
 *
 * Периодическая (обычно ежедневная) ретрансляция бухгалтерских документов
 * в Контур.Эльбу для записей с elba_sync_status='failed'. Подхватывает как
 * retail_act, так и subscription_act. Берёт не более 20 документов за вызов,
 * чтобы не упираться в max_duration.
 *
 * Защита: заголовок x-cron-secret должен совпадать с env CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/cron/retry-elba-sync' })

  const expectedSecret = process.env.CRON_SECRET
  if (!expectedSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const providedSecret =
    request.headers.get('x-cron-secret') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (providedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminServer()
  const { data: docs, error } = await db.raw(
    `SELECT id, doc_type FROM accounting_documents
      WHERE elba_sync_status = 'failed'
      ORDER BY updated_at ASC
      LIMIT 20`,
    []
  )
  if (error) {
    logger.error({ error: error.message }, 'Failed to load failed Elba syncs')
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  const results: Array<{ id: string; doc_type: string; status: 'synced' | 'failed'; error?: string | null }> = []

  for (const d of docs || []) {
    try {
      let res
      if (d.doc_type === 'retail_act') {
        const r = await resendRetailActToElba(d.id)
        res = {
          id: d.id,
          doc_type: d.doc_type,
          status: r.elbaSyncStatus,
          error: r.elbaError,
        }
      } else if (d.doc_type === 'subscription_act') {
        const r = await sendSubscriptionActToElba(d.id)
        res = { id: d.id, doc_type: d.doc_type, status: r.status, error: r.error }
      } else {
        continue
      }
      results.push(res)
    } catch (e: any) {
      results.push({
        id: d.id,
        doc_type: d.doc_type,
        status: 'failed',
        error: e.message || String(e),
      })
    }
  }

  const synced = results.filter((r) => r.status === 'synced').length
  const failed = results.filter((r) => r.status === 'failed').length

  logger.info({ attempted: results.length, synced, failed }, 'Elba retry batch completed')

  return NextResponse.json({
    attempted: results.length,
    synced,
    failed,
    details: results,
  })
}
