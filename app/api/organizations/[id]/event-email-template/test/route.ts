/**
 * POST /api/organizations/[id]/event-email-template/test
 * Body: { subject?, bodyMarkdown?, qrInstructionMarkdown?, to: string }
 * Sends a real email with sample variables to the given recipient (typically the
 * admin's own address). Use this to confirm the rendered output looks right
 * across email clients before saving.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'
import { applyTemplate, type TemplateVars } from '@/lib/utils/templateRenderer'
import { buildEmailHtml, pickTemplate } from '@/lib/services/registrationConfirmationService'
import { sendEmail } from '@/lib/services/email'
import { createAPILogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params
  const logger = createAPILogger(req, { endpoint: '/api/organizations/[id]/event-email-template/test' })

  const user = await getUnifiedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await getEffectiveOrgRole(user.id, orgId)
  if (!access || (access.role !== 'owner' && access.role !== 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const to: string = (typeof body.to === 'string' && body.to.trim()) || (user.email || '')
  if (!to) {
    return NextResponse.json({ error: 'Не указан адрес получателя' }, { status: 400 })
  }

  const tpl = pickTemplate(body)
  const paid = body.paid !== false
  const hasQr = body.hasQr !== false

  const db = createAdminServer()
  const { data: org } = await db.from('organizations').select('name, logo_url').eq('id', orgId).single()
  const orgName = org?.name || 'Orbo'

  const vars: TemplateVars = {
    event: { title: 'Тестовое событие (превью шаблона)', date: '15 мая 2026', time: '19:00', endTime: '22:00', location: 'Москва, ул. Тверская, 10', url: 'https://my.orbo.ru/e/sample', type: 'offline' },
    participant: { name: user.name || user.email || 'Тестовый участник' },
    org: { name: orgName },
    ticket: { shortCode: 'ABCD-1234', amount: 1500, paid, requiresPayment: true },
  }

  const subject = `[ТЕСТ] ${applyTemplate(tpl.subject, vars)}`
  const bodyMd = applyTemplate(tpl.bodyMarkdown, vars)
  const qrMd = applyTemplate(tpl.qrInstructionMarkdown, vars)

  const html = buildEmailHtml({
    bodyMarkdown: bodyMd,
    qrInstructionMarkdown: qrMd,
    hasQr,
    qrToken: 'sample-qr-token-1234567890abcdef',
    orgName,
    orgLogo: org?.logo_url || null,
  })

  try {
    const result = await sendEmail({ to, subject, html })
    if (!result.success) {
      logger.warn({ to, org_id: orgId, error: result.error }, 'Test email returned non-success')
      return NextResponse.json(
        { error: result.error || 'Не удалось отправить (провайдер не настроен)' },
        { status: 500 }
      )
    }
    logger.info({ to, org_id: orgId, message_id: result.messageId }, 'Test confirmation email sent')
    return NextResponse.json({ success: true, to })
  } catch (err: any) {
    logger.error({ to, error: err?.message }, 'Test email failed')
    return NextResponse.json({ error: err?.message || 'Не удалось отправить' }, { status: 500 })
  }
}
