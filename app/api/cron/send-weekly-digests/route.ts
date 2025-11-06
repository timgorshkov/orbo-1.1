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
        // Check if digest should be sent today
        const shouldSend = await shouldSendDigestNow(org, now);

        if (!shouldSend) {
          console.log(`[Cron] Skipping ${org.name} (not scheduled for now)`);
          continue;
        }

        console.log(`[Cron] Processing ${org.name}...`);

        // Get recipients (owners/admins with digest_notifications enabled)
        const { data: recipients, error: recipientsError } = await supabaseAdmin
          .from('memberships')
          .select(`
            user_id,
            role,
            digest_notifications,
            participants!inner(tg_user_id, full_name, username)
          `)
          .eq('org_id', org.id)
          .in('role', ['owner', 'admin'])
          .eq('digest_notifications', true);

        if (recipientsError) {
          console.error(`[Cron] Failed to fetch recipients for ${org.name}:`, recipientsError);
          results.push({ orgId: org.id, orgName: org.name, success: false, error: 'Failed to fetch recipients' });
          continue;
        }

        // Filter recipients with tg_user_id
        const validRecipients = recipients
          ?.filter((r: any) => r.participants?.tg_user_id)
          .map((r: any) => ({
            tgUserId: r.participants.tg_user_id,
            name: r.participants.full_name || r.participants.username || 'Участник'
          })) || [];

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

  // Check if today is the scheduled day
  if (orgDay !== org.digest_day) {
    return false;
  }

  // Check if current time is close to scheduled time (within 1 hour window)
  // This accounts for cron running once per hour
  if (orgHour !== digestHour) {
    return false;
  }

  // Check if digest was already sent today
  if (org.last_digest_sent_at) {
    const lastSent = new Date(org.last_digest_sent_at);
    const lastSentOrgTime = new Date(lastSent.toLocaleString('en-US', { timeZone: org.timezone || 'UTC' }));
    
    // If last sent was today (same day), skip
    if (
      lastSentOrgTime.getDate() === orgTime.getDate() &&
      lastSentOrgTime.getMonth() === orgTime.getMonth() &&
      lastSentOrgTime.getFullYear() === orgTime.getFullYear()
    ) {
      return false;
    }
  }

  return true;
}

