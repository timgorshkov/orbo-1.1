import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import {
  generateAndValidateBundle,
  type AccountingDocumentRow,
} from '@/lib/services/commercemlExportService'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST /api/superadmin/accounting/export
 *
 * Body:
 *   { from: '2026-04-01', to: '2026-04-30', docTypes?: string[], orgIds?: string[] }
 *
 * Возвращает ZIP:
 *   - commerceml.xml      — все документы одним пакетом CommerceML 2.10
 *   - documents/<N>.html  — HTML-версии каждого документа (rehydrate из S3)
 *   - manifest.json       — список документов с метаданными
 */
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/superadmin/accounting/export' })

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

    const body = await request.json().catch(() => ({}))
    const { from, to, docTypes, orgIds } = body as {
      from?: string
      to?: string
      docTypes?: string[]
      orgIds?: string[]
    }

    if (!from || !to) {
      return NextResponse.json(
        { error: 'from and to dates are required' },
        { status: 400 }
      )
    }

    // Собираем WHERE
    const conditions: string[] = ['doc_date BETWEEN $1::date AND $2::date']
    const params: any[] = [from, to]
    let p = 2

    if (docTypes && docTypes.length > 0) {
      const placeholders = docTypes.map(() => `$${++p}`).join(',')
      conditions.push(`doc_type IN (${placeholders})`)
      params.push(...docTypes)
    }
    if (orgIds && orgIds.length > 0) {
      const placeholders = orgIds.map(() => `$${++p}`).join(',')
      conditions.push(`org_id IN (${placeholders})`)
      params.push(...orgIds)
    }

    const { data: rows, error } = await db.raw(
      `SELECT
         id, doc_type, doc_number, doc_date,
         period_start, period_end,
         org_id, org_invoice_id, agent_report_id, contract_id,
         supplier_requisites, customer_requisites, customer_type,
         lines, total_amount, currency,
         html_url, status, metadata
       FROM accounting_documents
       WHERE ${conditions.join(' AND ')}
       ORDER BY doc_date ASC, doc_number ASC`,
      params
    )

    if (error) {
      logger.error({ error: error.message }, 'Failed to load documents for export')
      return NextResponse.json({ error: 'Failed to load documents' }, { status: 500 })
    }

    const docs = (rows || []) as AccountingDocumentRow[]

    if (docs.length === 0) {
      return NextResponse.json(
        { error: 'No documents found for specified filters' },
        { status: 404 }
      )
    }

    // Сгенерировать CommerceML
    const { xml, issues } = generateAndValidateBundle(docs)
    if (issues.length > 0) {
      logger.warn({ issues, count: docs.length }, 'CommerceML validation issues')
    }

    // Построить ZIP
    const zip = new JSZip()
    zip.file('commerceml.xml', xml)

    // Manifest
    const manifest = {
      generated_at: new Date().toISOString(),
      period: { from, to },
      filters: { docTypes, orgIds },
      total_count: docs.length,
      total_sum_rub: docs.reduce((s, d) => s + (typeof d.total_amount === 'string' ? parseFloat(d.total_amount) : d.total_amount), 0),
      documents: docs.map((d) => ({
        id: d.id,
        doc_number: d.doc_number,
        doc_type: d.doc_type,
        doc_date: d.doc_date,
        total_amount: d.total_amount,
        customer_name: d.customer_requisites?.name,
        customer_inn: d.customer_requisites?.inn,
      })),
      commerceml_issues: issues,
    }
    zip.file('manifest.json', JSON.stringify(manifest, null, 2))

    // HTML-версии (rehydrate по html_url — для простоты MVP просто ссылки; полный
    // скачиваемый HTML оставим для следующей итерации, чтобы не грузить S3 с сервера при каждом экспорте).
    // Для удобства добавляем index.html с оглавлением и прямыми ссылками.
    const indexLines = docs.map(
      (d) =>
        `<li><strong>${d.doc_number}</strong> от ${d.doc_date} — ${d.doc_type === 'subscription_act' ? 'Акт лицензии' : 'УПД на комиссию'} — ${d.customer_requisites?.name || ''} — ${Number(d.total_amount).toFixed(2)} ₽ — <a href="${d.html_url || '#'}" target="_blank">HTML</a></li>`
    )
    const indexHtml = `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Реестр документов ${from} — ${to}</title><style>body{font-family:system-ui,Arial,sans-serif;max-width:1000px;margin:20px auto;padding:0 20px;}</style></head><body><h1>Реестр бухгалтерских документов</h1><p>Период: ${from} — ${to}. Всего: ${docs.length} шт.</p><ul>${indexLines.join('')}</ul></body></html>`
    zip.file('index.html', indexHtml)

    const content = await zip.generateAsync({ type: 'nodebuffer' })

    logger.info(
      { from, to, count: docs.length, size_bytes: content.length, issues: issues.length },
      'Accounting export ZIP generated'
    )

    const filename = `orbo-docs-${from}_${to}.zip`
    // NextResponse body допускает Buffer при приведении через BodyInit.
    return new NextResponse(content as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': content.length.toString(),
      },
    })
  } catch (err: any) {
    logger.error({ error: err.message, stack: err.stack }, 'Error in POST /api/superadmin/accounting/export')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
