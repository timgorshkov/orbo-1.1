/**
 * Cron job: Send Weekly Digests
 * 
 * Runs daily at 6:00 UTC
 * Checks each org's timezone and sends digest if it's the right day/time
 * 
 * Authorization: CRON_SECRET
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateWeeklyDigest } from '@/lib/services/weeklyDigestService';
import { formatDigestForTelegram } from '@/lib/templates/weeklyDigest';
import { sendDigestBatch } from '@/lib/services/telegramNotificationService';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false
    }
  }
);

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Authorization check
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Allow localhost for testing
    const url = new URL(request.url);
    if (!url.hostname.includes('localhost') && url.hostname !== '127.0.0.1') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  console.log('[Cron] Weekly digest job started');

  try {
    // Get current UTC time
    const now = new Date();
    const currentDay = now.getUTCDay(); // 0 = Sunday, 1 = Monday, etc.
    const currentHour = now.getUTCHours();

    console.log(`[Cron] Current UTC: Day=${currentDay}, Hour=${currentHour}`);

    // Find organizations that should receive digest now
    const { data: orgs, error: orgsError } = await supabaseAdmin
      .from('organizations')
      .select('id, name, digest_enabled, digest_day, digest_time, timezone, last_digest_sent_at')
      .eq('digest_enabled', true);

    if (orgsError) {
      console.error('[Cron] Failed to fetch organizations:', orgsError);
      return NextResponse.json({ error: 'Failed to fetch organizations' }, { status: 500 });
    }

    if (!orgs || orgs.length === 0) {
      console.log('[Cron] No organizations with digest enabled');
      return NextResponse.json({ message: 'No orgs to process', processed: 0 });
    }

    console.log(`[Cron] Found ${orgs.length} orgs with digest enabled`);

    const results = [];

    for (const org of orgs) {
      try {
        // Log org settings for debugging
        console.log(`[Cron] Checking ${org.name}:`, {
          digest_day: org.digest_day,
          digest_time: org.digest_time,
          timezone: org.timezone,
          last_digest_sent_at: org.last_digest_sent_at
        });

        // Check if digest should be sent today
        const shouldSend = await shouldSendDigestNow(org, now);

        if (!shouldSend) {
          console.log(`[Cron] Skipping ${org.name} (not scheduled for now)`);
          continue;
        }

        console.log(`[Cron] ✅ Processing ${org.name}...`);

        // Get recipients (owners/admins with digest_notifications enabled)
        // Step 1: Fetch memberships
        const { data: memberships, error: membershipsError } = await supabaseAdmin
          .from('memberships')
          .select('user_id, role, digest_notifications')
          .eq('org_id', org.id)
          .in('role', ['owner', 'admin'])
          .eq('digest_notifications', true);

        if (membershipsError) {
          console.error(`[Cron] Failed to fetch memberships for ${org.name}:`, membershipsError);
          results.push({ orgId: org.id, orgName: org.name, success: false, error: 'Failed to fetch memberships' });
          continue;
        }

        if (!memberships || memberships.length === 0) {
          console.warn(`[Cron] No memberships found for ${org.name}`);
          results.push({ orgId: org.id, orgName: org.name, success: false, error: 'No memberships' });
          continue;
        }

        // Step 2: Fetch telegram accounts for these users
        const userIds = memberships.map(m => m.user_id);
        const { data: telegramAccounts, error: telegramError } = await supabaseAdmin
          .from('user_telegram_accounts')
          .select('user_id, telegram_user_id')
          .eq('org_id', org.id)
          .in('user_id', userIds);

        if (telegramError) {
          console.error(`[Cron] Failed to fetch telegram accounts for ${org.name}:`, telegramError);
          results.push({ orgId: org.id, orgName: org.name, success: false, error: 'Failed to fetch telegram accounts' });
          continue;
        }

        if (!telegramAccounts || telegramAccounts.length === 0) {
          console.warn(`[Cron] No telegram accounts found for ${org.name}`);
          results.push({ orgId: org.id, orgName: org.name, success: false, error: 'No telegram accounts' });
          continue;
        }

        // Step 3: Get telegram user IDs
        const tgUserIds = telegramAccounts.map(ta => ta.telegram_user_id);
        
        // Step 4: Fetch participants for these telegram users
        const { data: participants, error: participantsError } = await supabaseAdmin
          .from('participants')
          .select('tg_user_id, full_name, username')
          .eq('org_id', org.id)
          .in('tg_user_id', tgUserIds);

        if (participantsError) {
          console.error(`[Cron] Failed to fetch participants for ${org.name}:`, participantsError);
          results.push({ orgId: org.id, orgName: org.name, success: false, error: 'Failed to fetch participants' });
          continue;
        }

        // Step 5: Map telegram user id to participant name
        const participantMap = new Map(
          (participants || []).map(p => [p.tg_user_id, p])
        );

        // Step 6: Build valid recipients list (using telegram accounts)
        const validRecipients = telegramAccounts
          .map(ta => {
            const participant = participantMap.get(ta.telegram_user_id);
            return {
              tgUserId: ta.telegram_user_id,
              name: participant?.full_name || participant?.username || 'Участник'
            };
          })
          .filter((r): r is { tgUserId: number; name: string } => r.tgUserId !== null && r.tgUserId !== undefined);

        if (validRecipients.length === 0) {
          console.warn(`[Cron] No valid recipients for ${org.name}`);
          results.push({ orgId: org.id, orgName: org.name, success: false, error: 'No recipients' });
          continue;
        }

        // Generate digest
        const digest = await generateWeeklyDigest(org.id, null);
        const digestText = formatDigestForTelegram(digest);

        // Send to all recipients
        const sendResult = await sendDigestBatch(validRecipients, digestText);

        // Update last_digest_sent_at
        if (sendResult.sent > 0) {
          await supabaseAdmin
            .from('organizations')
            .update({ last_digest_sent_at: now.toISOString() })
            .eq('id', org.id);
        }

        results.push({
          orgId: org.id,
          orgName: org.name,
          success: sendResult.sent > 0,
          sent: sendResult.sent,
          failed: sendResult.failed,
          total: sendResult.total,
          costUsd: digest.cost.totalUsd
        });

        console.log(`[Cron] ${org.name}: ${sendResult.sent}/${sendResult.total} sent, cost $${digest.cost.totalUsd.toFixed(4)}`);

      } catch (error) {
        console.error(`[Cron] Error processing ${org.name}:`, error);
        results.push({
          orgId: org.id,
          orgName: org.name,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const totalCost = results.reduce((sum, r) => sum + (r.costUsd || 0), 0);

    console.log(`[Cron] Job complete: ${successCount}/${results.length} orgs processed, total cost $${totalCost.toFixed(4)}`);

    return NextResponse.json({
      success: true,
      processed: results.length,
      successful: successCount,
      totalCost: `$${totalCost.toFixed(4)}`,
      results
    });

  } catch (error) {
    console.error('[Cron] Fatal error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Check if digest should be sent now based on org's timezone and schedule
 */
async function shouldSendDigestNow(
  org: {
    digest_day: number;
    digest_time: string;
    timezone: string;
    last_digest_sent_at: string | null;
  },
  now: Date
): Promise<boolean> {
  // Convert current UTC time to org's timezone
  const orgTime = new Date(now.toLocaleString('en-US', { timeZone: org.timezone || 'UTC' }));
  const orgDay = orgTime.getDay();
  const orgHour = orgTime.getHours();
  const orgMinute = orgTime.getMinutes();

  // Parse digest_time (format: "HH:MM:SS")
  const [digestHour, digestMinute] = org.digest_time.split(':').map(Number);

  console.log(`[Cron] shouldSendDigestNow check:`, {
    orgTime: orgTime.toISOString(),
    orgDay,
    orgHour,
    digestDay: org.digest_day,
    digestHour,
    dayMatch: orgDay === org.digest_day,
    hourMatch: orgHour === digestHour
  });

  // Check if today is the scheduled day
  if (orgDay !== org.digest_day) {
    console.log(`[Cron] Day mismatch: org day ${orgDay} !== digest day ${org.digest_day}`);
    return false;
  }

  // Check if current time is close to scheduled time (within 1 hour window)
  // This accounts for cron running once per hour
  if (orgHour !== digestHour) {
    console.log(`[Cron] Hour mismatch: org hour ${orgHour} !== digest hour ${digestHour}`);
    return false;
  }

  // Check if digest was already sent today
  if (org.last_digest_sent_at) {
    const lastSent = new Date(org.last_digest_sent_at);
    const lastSentOrgTime = new Date(lastSent.toLocaleString('en-US', { timeZone: org.timezone || 'UTC' }));
    
    console.log(`[Cron] Last sent check:`, {
      lastSent: lastSent.toISOString(),
      lastSentOrgTime: lastSentOrgTime.toISOString(),
      lastSentDate: lastSentOrgTime.getDate(),
      currentDate: orgTime.getDate(),
      sameDay: lastSentOrgTime.getDate() === orgTime.getDate() &&
               lastSentOrgTime.getMonth() === orgTime.getMonth() &&
               lastSentOrgTime.getFullYear() === orgTime.getFullYear()
    });
    
    // If last sent was today (same day), skip
    if (
      lastSentOrgTime.getDate() === orgTime.getDate() &&
      lastSentOrgTime.getMonth() === orgTime.getMonth() &&
      lastSentOrgTime.getFullYear() === orgTime.getFullYear()
    ) {
      console.log(`[Cron] Already sent today, skipping`);
      return false;
    }
  }

  console.log(`[Cron] ✅ Should send digest NOW`);
  return true;
}

