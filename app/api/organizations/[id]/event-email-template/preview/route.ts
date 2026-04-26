/**
 * POST /api/organizations/[id]/event-email-template/preview
 * Body: { subject?, bodyMarkdown?, qrInstructionMarkdown?, paid?: boolean, hasQr?: boolean }
 * Returns: { subject, html } — full email HTML rendered with sample variables.
 *
 * Used by the admin editor to show a live preview without saving the template.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'
import { applyTemplate, type TemplateVars } from '@/lib/utils/templateRenderer'
import { buildEmailHtml, pickTemplate } from '@/lib/services/registrationConfirmationService'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params

  const user = await getUnifiedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await getEffectiveOrgRole(user.id, orgId)
  if (!access || (access.role !== 'owner' && access.role !== 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const tpl = pickTemplate(body)
  const paid = body.paid !== false // default true (show "оплачено" block)
  const hasQr = body.hasQr !== false // default true

  const db = createAdminServer()
  const { data: org } = await db.from('organizations').select('name, logo_url').eq('id', orgId).single()
  const orgName = org?.name || 'Orbo'
  const orgLogo = org?.logo_url || null

  const vars: TemplateVars = {
    event: {
      title: 'Демо: Встреча клуба',
      date: '15 мая 2026',
      time: '19:00',
      endTime: '22:00',
      location: 'Москва, ул. Тверская, 10',
      url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru'}/e/sample-event`,
      type: 'offline',
    },
    participant: { name: 'Иван Петров' },
    org: { name: orgName },
    ticket: {
      shortCode: 'ABCD-1234',
      amount: 1500,
      paid,
      requiresPayment: true,
    },
  }

  const subject = applyTemplate(tpl.subject, vars)
  const bodyMd = applyTemplate(tpl.bodyMarkdown, vars)
  const qrMd = applyTemplate(tpl.qrInstructionMarkdown, vars)

  const html = buildEmailHtml({
    bodyMarkdown: bodyMd,
    qrInstructionMarkdown: qrMd,
    hasQr,
    qrToken: 'sample-qr-token-1234567890abcdef',
    orgName,
    orgLogo,
  })

  return NextResponse.json({ subject, html })
}
