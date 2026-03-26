import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getParticipantSession, setParticipantSession } from '@/lib/participant-auth/session'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

/**
 * POST /api/participant-auth/telegram-link
 * Generates a 6-digit code for a participant to link their Telegram account.
 * The participant sends this code to the Orbo bot; the bot records their telegram_user_id.
 *
 * GET /api/participant-auth/telegram-link?code=XXX
 * Polls status. When the bot has recorded telegram_user_id:
 *  - Updates participants.tg_user_id
 *  - Handles conflict (another participant with same tg_user_id → merges them)
 *  - Migrates participant_messages from merged record
 *  - Re-issues participant session with tgUserId
 *  - Returns { linked: true } or { linked: false }
 */

export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: 'participant-auth/telegram-link' })

  const session = await getParticipantSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const orgId = body.orgId || session.orgId

  if (orgId !== session.orgId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db = createAdminServer()

  // Verify participant exists and is not merged
  const { data: participant } = await db
    .from('participants')
    .select('id, tg_user_id, merged_into')
    .eq('id', session.participantId)
    .maybeSingle()

  if (!participant || participant.merged_into) {
    return NextResponse.json({ error: 'Participant not found' }, { status: 404 })
  }

  if (participant.tg_user_id) {
    return NextResponse.json({ error: 'Telegram already linked' }, { status: 409 })
  }

  // Generate unique 6-char hex code (same format as admin flow)
  let code = ''
  for (let attempt = 0; attempt < 10; attempt++) {
    code = crypto.randomBytes(3).toString('hex').toUpperCase()
    const { data: existing } = await db
      .from('telegram_auth_codes')
      .select('id')
      .eq('code', code)
      .eq('is_used', false)
      .maybeSingle()
    if (!existing) break
  }

  if (!code) {
    return NextResponse.json({ error: 'Failed to generate code' }, { status: 500 })
  }

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 min

  const { error: insertError } = await db.from('telegram_auth_codes').insert({
    code,
    org_id: orgId,
    participant_id: session.participantId,
    expires_at: expiresAt,
    is_used: false,
  })

  if (insertError) {
    logger.error({ error: insertError.message }, 'Failed to insert telegram auth code')
    return NextResponse.json({ error: 'Failed to generate code' }, { status: 500 })
  }

  const botUsername =
    process.env.NEXT_PUBLIC_TELEGRAM_REGISTRATION_BOT_USERNAME || 'orbo_start_bot'

  logger.info({ participant_id: session.participantId, org_id: orgId }, 'TG link code generated')

  return NextResponse.json({ code, botUsername, expiresAt })
}

export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: 'participant-auth/telegram-link' })

  const session = await getParticipantSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  if (!code) {
    return NextResponse.json({ error: 'code required' }, { status: 400 })
  }

  const db = createAdminServer()

  // Find the code record
  const { data: authCode } = await db
    .from('telegram_auth_codes')
    .select('id, telegram_user_id, is_used, expires_at, participant_id')
    .eq('code', code.toUpperCase())
    .eq('participant_id', session.participantId)
    .maybeSingle()

  if (!authCode) {
    return NextResponse.json({ linked: false, reason: 'not_found' })
  }

  // Expired?
  if (new Date(authCode.expires_at) < new Date()) {
    return NextResponse.json({ linked: false, reason: 'expired' })
  }

  // Not yet confirmed by bot
  if (!authCode.telegram_user_id) {
    return NextResponse.json({ linked: false })
  }

  const tgUserId = String(authCode.telegram_user_id)

  // --- FINALIZE: link tg_user_id to participant ---

  // Get current participant (re-fetch, might be merged by now)
  const { data: currentParticipant } = await db
    .from('participants')
    .select('id, tg_user_id, full_name, email, merged_into')
    .eq('id', session.participantId)
    .maybeSingle()

  if (!currentParticipant || currentParticipant.merged_into) {
    // Current participant was merged elsewhere; follow chain
    logger.warn({ participant_id: session.participantId }, 'Participant already merged during TG link')
    return NextResponse.json({ linked: false, reason: 'participant_merged' })
  }

  // Already linked to this same tg_user_id? Idempotent success.
  if (currentParticipant.tg_user_id === tgUserId) {
    return NextResponse.json({ linked: true, merged: false })
  }

  // Check for conflict: another participant in this org already has this tg_user_id
  const { data: conflictParticipant } = await db
    .from('participants')
    .select('id, full_name, email, tg_user_id')
    .eq('org_id', session.orgId)
    .eq('tg_user_id', tgUserId)
    .is('merged_into', null)
    .neq('id', session.participantId)
    .maybeSingle()

  let merged = false

  if (conflictParticipant) {
    // MERGE: conflictParticipant (TG-only profile) → currentParticipant (email profile)
    // target = currentParticipant (the one the user is authenticated as)
    // source/duplicate = conflictParticipant (TG-only)
    logger.info(
      {
        target_id: currentParticipant.id,
        source_id: conflictParticipant.id,
        tg_user_id: tgUserId,
      },
      'Merging TG profile into current participant'
    )

    // Call merge_participants RPC: target first, duplicates array
    const { error: mergeError } = await db.rpc('merge_participants', {
      p_target: currentParticipant.id,
      p_duplicates: [conflictParticipant.id],
      p_actor: null,
    })

    if (mergeError) {
      logger.error({ error: mergeError.message }, 'merge_participants RPC failed')
      // Don't fail hard — still link the tg_user_id below
    } else {
      // migrate participant_messages (merge_participants does not handle this)
      await db
        .from('participant_messages')
        .update({ participant_id: currentParticipant.id })
        .eq('participant_id', conflictParticipant.id)

      merged = true
      logger.info(
        { target_id: currentParticipant.id, source_id: conflictParticipant.id },
        'Participant merge complete, messages migrated'
      )
    }
  } else {
    // No conflict — just update tg_user_id on current participant directly
    const { error: updateError } = await db
      .from('participants')
      .update({ tg_user_id: tgUserId })
      .eq('id', currentParticipant.id)

    if (updateError) {
      logger.error({ error: updateError.message }, 'Failed to update tg_user_id on participant')
      return NextResponse.json({ error: 'Failed to link Telegram' }, { status: 500 })
    }
  }

  // Mark code as used
  await db
    .from('telegram_auth_codes')
    .update({ is_used: true, used_at: new Date().toISOString() })
    .eq('id', authCode.id)

  // Fetch updated participant to get TG details (username etc from merge)
  const { data: updatedParticipant } = await db
    .from('participants')
    .select('id, full_name, email, tg_user_id, username')
    .eq('id', currentParticipant.id)
    .maybeSingle()

  // Re-issue participant session with tgUserId
  const response = NextResponse.json({
    linked: true,
    merged,
    tgUserId,
    conflictName: conflictParticipant?.full_name || null,
  })

  await setParticipantSession({
    participantId: session.participantId,
    orgId: session.orgId,
    email: session.email,
    tgUserId,
    name: updatedParticipant?.full_name || session.name,
  })

  logger.info(
    { participant_id: session.participantId, tg_user_id: tgUserId, merged },
    'TG linked to participant successfully'
  )

  return response
}
