import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { requireSuperadmin } from '@/lib/server/superadminGuard'
import { generateSubscriptionAct } from '@/lib/services/subscriptionActService'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/superadmin/invoices/[id]/regenerate-act
 *
 * Пересоздаёт акт лицензии (АЛ) для инвойса. Используется, когда:
 *   - invoice был оплачен до появления accounting_documents (legacy),
 *   - или бизнес-логика акта поменялась и нужно перегенерировать с новыми реквизитами.
 *
 * Логика:
 *   1. Сбрасывает act_number, act_document_url, act_generated_at, accounting_document_id
 *      на инвойсе (старые поля, удерживающие ссылку).
 *   2. Удаляет старый accounting_document, если был.
 *   3. Вызывает generateSubscriptionAct(invoiceId) — он создаст свежий acc.doc + html + АЛ-N.
 *   4. Fire-and-forget отправка в Эльбу уже встроена в generateSubscriptionAct.
 *
 * Связка с оплатой сохраняется: поле `paid_at` и сумма инвойса не трогаются.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, {
    endpoint: 'superadmin/invoices/[id]/regenerate-act',
  })
  const { id } = await params

  try {
    await requireSuperadmin()
    const db = createAdminServer()

    const { data: invoice, error: invErr } = await db.raw(
      `SELECT id, org_id, act_number, accounting_document_id, status
         FROM org_invoices WHERE id = $1 LIMIT 1`,
      [id]
    )
    if (invErr) {
      return NextResponse.json({ error: invErr.message }, { status: 500 })
    }
    const row = invoice?.[0]
    if (!row) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }
    if (row.status !== 'paid') {
      return NextResponse.json(
        { error: `Invoice is not paid (status=${row.status}); regeneration is only supported for paid invoices.` },
        { status: 400 }
      )
    }

    // 1. Удалить старый accounting_document (если есть)
    const oldDocId = row.accounting_document_id
    if (oldDocId) {
      await db.from('accounting_documents').delete().eq('id', oldDocId)
    }

    // 2. Сбросить legacy-поля на инвойсе, чтобы generateSubscriptionAct не считал
    //    их «уже сформированным актом».
    await db
      .from('org_invoices')
      .update({
        act_number: null,
        act_document_url: null,
        act_generated_at: null,
        accounting_document_id: null,
      })
      .eq('id', id)

    // 3. Перегенерировать
    const result = await generateSubscriptionAct(id)

    logger.info(
      {
        invoice_id: id,
        old_doc_id: oldDocId,
        old_act_number: row.act_number,
        new_doc_id: result.documentId,
        new_act_number: result.actNumber,
        skipped: result.skipped,
      },
      'Subscription act regenerated via superadmin'
    )

    return NextResponse.json({
      invoiceId: id,
      previousActNumber: row.act_number,
      previousDocumentId: oldDocId,
      newDocumentId: result.documentId,
      newActNumber: result.actNumber,
      htmlUrl: result.htmlUrl,
      skipped: result.skipped || null,
    })
  } catch (error: any) {
    if (error?.message === 'NEXT_REDIRECT') throw error
    logger.error(
      { invoice_id: id, error: error instanceof Error ? error.message : String(error) },
      'Error in regenerate-act'
    )
    return NextResponse.json(
      { error: error?.message || 'Internal error' },
      { status: 500 }
    )
  }
}
