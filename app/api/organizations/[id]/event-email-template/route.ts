/**
 * GET  /api/organizations/[id]/event-email-template
 *   → { template, isDefault } — current org's template (or platform default if none).
 *
 * PUT  /api/organizations/[id]/event-email-template
 *   body: { subject, bodyMarkdown, qrInstructionMarkdown } — save org template.
 *   Pass null/empty body to reset to default.
 *
 * Access: org owner or admin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'
import { createAPILogger } from '@/lib/logger'
import { DEFAULT_EVENT_EMAIL_TEMPLATE } from '@/lib/utils/templateRenderer'
import { pickTemplate } from '@/lib/services/registrationConfirmationService'

export const dynamic = 'force-dynamic'

async function requireAdminAccess(orgId: string): Promise<{ userId: string } | NextResponse> {
  const user = await getUnifiedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await getEffectiveOrgRole(user.id, orgId)
  if (!access || (access.role !== 'owner' && access.role !== 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return { userId: user.id }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params
  const auth = await requireAdminAccess(orgId)
  if (auth instanceof NextResponse) return auth

  const db = createAdminServer()
  const { data: org } = await db
    .from('organizations')
    .select('event_email_template')
    .eq('id', orgId)
    .single()

  const saved = org?.event_email_template || null
  const effective = pickTemplate(saved)

  return NextResponse.json({
    template: effective,
    isDefault: !saved,
    defaults: DEFAULT_EVENT_EMAIL_TEMPLATE,
  })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params
  const logger = createAPILogger(req, { endpoint: '/api/organizations/[id]/event-email-template' })

  const auth = await requireAdminAccess(orgId)
  if (auth instanceof NextResponse) return auth

  const body = await req.json().catch(() => ({}))
  const reset = body && body.reset === true

  const value = reset
    ? null
    : {
        subject: typeof body.subject === 'string' ? body.subject : '',
        bodyMarkdown: typeof body.bodyMarkdown === 'string' ? body.bodyMarkdown : '',
        qrInstructionMarkdown: typeof body.qrInstructionMarkdown === 'string' ? body.qrInstructionMarkdown : '',
        updatedAt: new Date().toISOString(),
      }

  const db = createAdminServer()
  const { error } = await db
    .from('organizations')
    .update({ event_email_template: value })
    .eq('id', orgId)

  if (error) {
    logger.error({ error: error.message, org_id: orgId }, 'Failed to save event email template')
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }

  logger.info({ org_id: orgId, reset }, 'Event email template updated')
  return NextResponse.json({ success: true, isDefault: !value })
}
