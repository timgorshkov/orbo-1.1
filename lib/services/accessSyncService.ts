import { createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'
import { getPlanAccessRules, getParticipantMembership, type MembershipPlanAccess } from './membershipService'
import { TelegramService } from './telegramService'

const logger = createServiceLogger('AccessSyncService')

const BATCH_DELAY_MS = 100

// ─── Types ───────────────────────────────────────────────────────────

interface SyncResult {
  resource_type: string
  resource_id: string | null
  success: boolean
  error?: string
}

// ─── Main Sync ───────────────────────────────────────────────────────

/**
 * Sync access for a single participant membership: invite to or remove from
 * all resources in the plan's access rules.
 */
export async function syncMembershipAccess(
  membershipId: string,
  action: 'grant' | 'revoke'
): Promise<SyncResult[]> {
  const supabase = createAdminServer()

  // Two queries instead of one — Supabase-style joins don't work on PostgresDbClient.
  const { data: membershipRows, error } = await supabase.raw(
    `SELECT m.id, m.org_id, m.participant_id, m.plan_id, m.status,
            p.id AS p_id, p.tg_user_id AS p_tg_user_id, p.user_id AS p_user_id
       FROM participant_memberships m
       LEFT JOIN participants p ON p.id = m.participant_id
      WHERE m.id = $1
      LIMIT 1`,
    [membershipId]
  )

  const row: any = (membershipRows && membershipRows[0]) || null
  if (error || !row) {
    logger.error({ membership_id: membershipId, error: error?.message }, 'Membership not found for sync')
    return []
  }

  const membership = {
    id: row.id,
    org_id: row.org_id,
    participant_id: row.participant_id,
    plan_id: row.plan_id,
    status: row.status,
  }
  const participant = row.p_id
    ? { id: row.p_id, tg_user_id: row.p_tg_user_id, user_id: row.p_user_id }
    : null
  if (!participant) {
    logger.warn({ membership_id: membershipId }, 'No participant linked')
    return []
  }

  const rules = await getPlanAccessRules(membership.plan_id)
  if (rules.length === 0) {
    await updateSyncStatus(membershipId, 'not_applicable')
    return []
  }

  const results: SyncResult[] = []

  // Get org's bot token for Telegram operations
  const botToken = await getOrgBotToken(membership.org_id)

  for (const rule of rules) {
    try {
      const result = await syncSingleResource({
        rule,
        participant,
        orgId: membership.org_id,
        action,
        botToken,
      })
      results.push(result)
      await sleep(BATCH_DELAY_MS)
    } catch (err) {
      results.push({
        resource_type: rule.resource_type,
        resource_id: rule.resource_id,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const allSuccess = results.every(r => r.success)
  const anyFailed = results.some(r => !r.success)

  await updateSyncStatus(
    membershipId,
    allSuccess ? 'synced' : anyFailed ? 'failed' : 'synced'
  )

  logger.info({
    membership_id: membershipId,
    action,
    total: results.length,
    succeeded: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
  }, 'Access sync completed')

  return results
}

// ─── Single Resource Sync ────────────────────────────────────────────

async function syncSingleResource(params: {
  rule: MembershipPlanAccess
  participant: { id: string; tg_user_id: string | null; user_id: string | null }
  orgId: string
  action: 'grant' | 'revoke'
  botToken: string | null
}): Promise<SyncResult> {
  const { rule, participant, action, botToken } = params

  switch (rule.resource_type) {
    case 'telegram_group':
    case 'telegram_channel': {
      if (!botToken) {
        return { resource_type: rule.resource_type, resource_id: rule.resource_id, success: false, error: 'No bot token configured' }
      }
      if (!participant.tg_user_id) {
        return { resource_type: rule.resource_type, resource_id: rule.resource_id, success: false, error: 'Participant has no Telegram user ID' }
      }

      const tg = new TelegramService(botToken)
      const chatId = parseInt(rule.resource_id || '0')
      const tgUserId = parseInt(participant.tg_user_id)

      if (action === 'grant') {
        const result = await tg.createChatInviteLink(chatId, {
          member_limit: 1,
          expire_date: Math.floor(Date.now() / 1000) + 86400,
        })
        logger.info({ chat_id: chatId, tg_user_id: tgUserId, invite_link: result?.result?.invite_link }, 'Created invite link')
        return { resource_type: rule.resource_type, resource_id: rule.resource_id, success: true }
      } else {
        try {
          await tg.banChatMember(chatId, tgUserId, Math.floor(Date.now() / 1000) + 60)
          await sleep(500)
          await tg.unbanChatMember(chatId, tgUserId)
          logger.info({ chat_id: chatId, tg_user_id: tgUserId }, 'Kicked from chat')
        } catch (err) {
          logger.warn({ chat_id: chatId, tg_user_id: tgUserId, error: err }, 'Kick failed (may already be out)')
        }
        return { resource_type: rule.resource_type, resource_id: rule.resource_id, success: true }
      }
    }

    case 'max_group': {
      // MAX group invite/remove — not yet implemented; log and skip
      logger.info({
        resource_type: rule.resource_type,
        resource_id: rule.resource_id,
        action,
      }, 'MAX group sync not yet implemented')
      return { resource_type: rule.resource_type, resource_id: rule.resource_id, success: true }
    }

    case 'materials':
    case 'events':
    case 'member_directory': {
      // Content gating is handled at render time by checkMembershipGate; no action needed
      return { resource_type: rule.resource_type, resource_id: rule.resource_id, success: true }
    }

    default:
      return { resource_type: rule.resource_type, resource_id: rule.resource_id, success: false, error: `Unknown resource type: ${rule.resource_type}` }
  }
}

// ─── Bulk Sync ───────────────────────────────────────────────────────

/**
 * Sync all pending memberships for an org (batch job).
 */
export async function syncPendingAccessForOrg(orgId: string): Promise<number> {
  const supabase = createAdminServer()

  const { data: pending, error } = await supabase
    .from('participant_memberships')
    .select('id, status')
    .eq('org_id', orgId)
    .eq('access_sync_status', 'pending')
    .limit(100)

  if (error || !pending) {
    logger.error({ org_id: orgId, error: error?.message }, 'Failed to fetch pending syncs')
    return 0
  }

  let synced = 0
  for (const m of pending) {
    const action = (m.status === 'active' || m.status === 'trial') ? 'grant' : 'revoke'
    await syncMembershipAccess(m.id, action)
    synced++
  }

  return synced
}

// ─── Helpers ─────────────────────────────────────────────────────────

async function getOrgBotToken(orgId: string): Promise<string | null> {
  const supabase = createAdminServer()

  const { data } = await supabase
    .from('org_telegram_bots')
    .select('bot_token')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  return data?.bot_token || process.env.TELEGRAM_BOT_TOKEN || null
}

async function updateSyncStatus(membershipId: string, status: string) {
  const supabase = createAdminServer()
  await supabase
    .from('participant_memberships')
    .update({
      access_sync_status: status,
      access_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', membershipId)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
