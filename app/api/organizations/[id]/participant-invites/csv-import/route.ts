/**
 * POST /api/organizations/[id]/participant-invites/csv-import
 * Bulk import emails from CSV text and send invites.
 * Body: { csv: string } — raw CSV text, one email per line (or comma-separated, or with columns)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getEmailService } from '@/lib/services/emailService'
import { buildParticipantInviteEmail } from '@/lib/services/email/participantInviteTemplate'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru'
const MAX_EMAILS_PER_IMPORT = 500

function parseEmailsFromCsv(csv: string): string[] {
  // Extract all valid-looking emails from the CSV content
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g
  const matches = csv.match(emailRegex) || []
  const seen = new Map<string, boolean>()
  const unique: string[] = []
  for (const m of matches) {
    const email = m.toLowerCase().trim()
    if (!seen.has(email)) { seen.set(email, true); unique.push(email) }
  }
  return unique
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orgId } = await params
  const logger = createAPILogger(req, { endpoint: '/api/organizations/[id]/participant-invites/csv-import' })
  const db = createAdminServer()

  const user = await getUnifiedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await getEffectiveOrgRole(user.id, orgId)
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { csv, personalNote } = await req.json()

    if (!csv || typeof csv !== 'string') {
      return NextResponse.json({ error: 'CSV обязателен' }, { status: 400 })
    }

    const emails = parseEmailsFromCsv(csv)

    if (emails.length === 0) {
      return NextResponse.json({ error: 'Не найдено ни одного email' }, { status: 400 })
    }
    if (emails.length > MAX_EMAILS_PER_IMPORT) {
      return NextResponse.json(
        { error: `Максимум ${MAX_EMAILS_PER_IMPORT} email за один импорт` },
        { status: 400 }
      )
    }

    // Load org branding once
    const { data: org } = await db
      .from('organizations')
      .select('name, logo_url, portal_cover_url, public_description')
      .eq('id', orgId)
      .single()

    if (!org) {
      return NextResponse.json({ error: 'Организация не найдена' }, { status: 404 })
    }

    const { data: userInfo } = await db
      .from('users')
      .select('name')
      .eq('id', user.id)
      .single()

    // Find existing pending invites for these emails
    const { data: existingInvites } = await db
      .from('participant_email_invites')
      .select('email, token')
      .eq('org_id', orgId)
      .eq('status', 'pending')
      .in('email', emails)

    const existingByEmail = new Map<string, string>((existingInvites || []).map((i: any) => [i.email as string, i.token as string]))

    const emailService = getEmailService()
    const results = { sent: 0, skipped: 0, errors: 0 }

    for (const email of emails) {
      try {
        let token: string

        if (existingByEmail.has(email)) {
          // Reuse existing invite token
          token = existingByEmail.get(email)!
        } else {
          // Create new invite
          const { data: invite, error } = await db
            .from('participant_email_invites')
            .insert({
              org_id: orgId,
              email,
              invited_by: user.id,
              personal_note: personalNote || null,
            })
            .select('token')
            .single()

          if (error || !invite) {
            results.errors++
            continue
          }
          token = (invite as any).token as string
        }

        const inviteLink = `${APP_URL}/p/${orgId}/join/email/${token}`
        const { subject, html } = buildParticipantInviteEmail({
          org,
          inviteLink,
          invitedByName: userInfo?.name || undefined,
          personalNote: personalNote || undefined,
        })

        const ok = await emailService.sendEmail({ to: email, subject, html })
        if (ok) results.sent++
        else results.errors++
      } catch {
        results.errors++
      }
    }

    logger.info({ ...results, total: emails.length, org_id: orgId }, 'CSV invite import completed')

    return NextResponse.json({ ok: true, total: emails.length, ...results })
  } catch (err: any) {
    logger.error({ error: err.message, stack: err.stack }, 'Error in CSV invite import')
    return NextResponse.json({ error: 'Внутренняя ошибка' }, { status: 500 })
  }
}
