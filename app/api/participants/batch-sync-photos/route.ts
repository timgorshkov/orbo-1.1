import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { TelegramService } from '@/lib/services/telegramService'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { createStorage, getBucket, getStoragePath } from '@/lib/storage'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const BUCKET_NAME = 'participant-photos'
const BATCH_LIMIT = 20
const DELAY_BETWEEN_MS = 300

/**
 * POST /api/participants/batch-sync-photos
 * Background sequential photo sync for participants without avatars.
 * Called when user opens the members list page.
 */
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/participants/batch-sync-photos' })

  try {
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId, participantIds } = await request.json()
    if (!orgId || !Array.isArray(participantIds) || participantIds.length === 0) {
      return NextResponse.json({ error: 'orgId and participantIds required' }, { status: 400 })
    }

    const supabase = createAdminServer()

    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const ids = participantIds.slice(0, BATCH_LIMIT)

    const { data: participants } = await supabase
      .from('participants')
      .select('id, tg_user_id, org_id, photo_url')
      .in('id', ids)
      .eq('org_id', orgId)
      .is('merged_into', null)

    if (!participants || participants.length === 0) {
      return NextResponse.json({ synced: 0, skipped: 0, failed: 0 })
    }

    const needSync = participants.filter(
      p => p.tg_user_id && (!p.photo_url || !p.photo_url.includes('participant-photos'))
    )

    logger.info({ org_id: orgId, total: ids.length, need_sync: needSync.length }, 'Batch photo sync started')

    let synced = 0
    let skipped = 0
    let failed = 0

    for (const participant of needSync) {
      try {
        const result = await syncOnePhoto(supabase, participant, logger)
        if (result === 'synced') synced++
        else if (result === 'skipped') skipped++
        else failed++
      } catch {
        failed++
      }

      if (needSync.indexOf(participant) < needSync.length - 1) {
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_MS))
      }
    }

    logger.info({ org_id: orgId, synced, skipped, failed }, 'Batch photo sync complete')
    return NextResponse.json({ synced, skipped, failed })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    logger.error({ error: msg }, 'Batch photo sync error')
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

async function syncOnePhoto(
  supabase: ReturnType<typeof createAdminServer>,
  participant: { id: string; tg_user_id: number | string; org_id: string },
  logger: ReturnType<typeof createAPILogger>,
): Promise<'synced' | 'skipped' | 'failed'> {
  const tgUserId = Number(participant.tg_user_id)
  const botTypes: Array<'main' | 'notifications' | 'event'> = ['main', 'notifications', 'event']
  let tg: TelegramService | null = null
  let photosResponse: any = null

  for (const botType of botTypes) {
    try {
      tg = new TelegramService(botType)
      const resp = await tg.getUserProfilePhotos(tgUserId, 0, 1)
      if (resp.ok && resp.result.photos.length > 0) {
        photosResponse = resp
        break
      }
      break
    } catch {
      continue
    }
  }

  if (!photosResponse || !tg) return 'skipped'

  try {
    const photos = photosResponse.result.photos[0]
    const largestPhoto = photos[photos.length - 1]
    const fileResponse = await tg.getFile(largestPhoto.file_id)
    if (!fileResponse.ok || !fileResponse.result.file_path) return 'failed'

    const fileBuffer = await tg.downloadFile(fileResponse.result.file_path)
    const storage = createStorage()
    const bucket = getBucket(BUCKET_NAME)
    const ext = fileResponse.result.file_path.split('.').pop() || 'jpg'
    const filePath = getStoragePath(BUCKET_NAME, `${participant.org_id}/${participant.id}-telegram.${ext}`)

    const { error: uploadError } = await storage.upload(bucket, filePath, fileBuffer, {
      contentType: `image/${ext}`,
      cacheControl: 'public, max-age=31536000',
    })
    if (uploadError) return 'failed'

    const publicUrl = storage.getPublicUrl(bucket, filePath)
    await supabase
      .from('participants')
      .update({ photo_url: publicUrl, updated_at: new Date().toISOString() })
      .eq('id', participant.id)

    logger.debug({ participant_id: participant.id }, 'Batch: photo synced')
    return 'synced'
  } catch {
    return 'failed'
  }
}
