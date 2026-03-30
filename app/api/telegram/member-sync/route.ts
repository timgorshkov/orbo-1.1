import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'
import { createAPILogger } from '@/lib/logger'
import {
  isServiceAccountConfigured,
  startMemberSyncJob,
  getLatestSyncJob,
} from '@/lib/services/telegramMemberSyncService'

export const dynamic = 'force-dynamic'

// GET /api/telegram/member-sync?orgId=...&tgChatId=...
// Returns latest sync job status + whether service account is configured
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: 'telegram/member-sync' })
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const orgId = searchParams.get('orgId')
  const tgChatId = searchParams.get('tgChatId')

  if (!orgId || !tgChatId) {
    return NextResponse.json({ error: 'Missing orgId or tgChatId' }, { status: 400 })
  }

  const role = await getEffectiveOrgRole(session.user.id, orgId)
  if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const configured = isServiceAccountConfigured()
  const job = await getLatestSyncJob(orgId, parseInt(tgChatId))

  return NextResponse.json({ configured, job })
}

// POST /api/telegram/member-sync
// Starts a new sync job
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: 'telegram/member-sync' })
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { orgId, tgChatId } = body

  if (!orgId || !tgChatId) {
    return NextResponse.json({ error: 'Missing orgId or tgChatId' }, { status: 400 })
  }

  const role = await getEffectiveOrgRole(session.user.id, orgId)
  if (!role || (role.role !== 'owner' && role.role !== 'admin' && !role.isSuperadmin)) {
    return NextResponse.json({ error: 'Forbidden: owner or admin required' }, { status: 403 })
  }

  if (!isServiceAccountConfigured()) {
    return NextResponse.json(
      { error: 'Service account not configured. Contact platform administrator.' },
      { status: 503 }
    )
  }

  try {
    const { jobId } = await startMemberSyncJob(orgId, parseInt(tgChatId), session.user.id)
    logger.info({ job_id: jobId, org_id: orgId, tg_chat_id: tgChatId }, 'Member sync job started')
    return NextResponse.json({ jobId, message: 'Синхронизация запущена' })
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to start member sync')
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
