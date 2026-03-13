import { NextRequest, NextResponse } from 'next/server'
import { createCronLogger } from '@/lib/logger'
import { expireOverdueMemberships } from '@/lib/services/membershipService'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { syncMembershipAccess } from '@/lib/services/accessSyncService'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const logger = createCronLogger('check-memberships')
  const startTime = Date.now()

  try {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    logger.info({}, 'Starting membership expiration check')

    // Step 1: Expire overdue memberships (respecting grace period)
    const expiredCount = await expireOverdueMemberships()

    // Step 2: Sync access for memberships with pending sync status
    let syncedCount = 0
    try {
      const supabase = createAdminServer()
      const { data: pendingSync } = await supabase
        .from('participant_memberships')
        .select('id, status')
        .eq('access_sync_status', 'pending')
        .limit(50)

      if (pendingSync && pendingSync.length > 0) {
        for (const m of pendingSync) {
          const action = (m.status === 'active' || m.status === 'trial') ? 'grant' : 'revoke'
          await syncMembershipAccess(m.id, action)
          syncedCount++
        }
      }
    } catch (syncErr) {
      logger.error({ error: syncErr instanceof Error ? syncErr.message : String(syncErr) }, 'Access sync step failed')
    }

    const duration = Date.now() - startTime
    logger.info({ expired_count: expiredCount, synced_count: syncedCount, duration_ms: duration }, 'Membership check complete')

    return NextResponse.json({
      success: true,
      expired: expiredCount,
      synced: syncedCount,
      duration_ms: duration,
    })
  } catch (err) {
    logger.error({ error: err instanceof Error ? err.message : String(err) }, 'Membership check failed')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
