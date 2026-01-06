import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createCronLogger } from '@/lib/logger';

// Service role client for bypassing RLS
const supabaseServiceRole = createAdminServer();

/**
 * Telegram Health Check Cron Job
 * 
 * This endpoint should be called every 10 minutes by Vercel Cron
 * 
 * Configured in vercel.json with schedule: "every 10 minutes"
 */
export async function GET(req: NextRequest) {
  const logger = createCronLogger('telegram-health-check');
  
  // Verify cron secret (Vercel passes this automatically)
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  // In production, verify the secret
  if (process.env.NODE_ENV === 'production' && cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      logger.error('Unauthorized cron request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  
  logger.info('Health check started');
  
  try {
    // Get all groups
    const { data: groups, error } = await supabaseServiceRole
      .from('telegram_groups')
      .select('id, tg_chat_id, title, last_sync_at, bot_status');
    
    if (error) {
      logger.error({ error }, 'Error fetching groups');
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    logger.info({ groupsCount: groups?.length || 0 }, 'Checking groups');
    
    const results = [];
    let healthyCount = 0;
    let degradedCount = 0;
    let unhealthyCount = 0;
    
    for (const group of groups || []) {
      // Get org_id from org_telegram_groups mapping
      const { data: orgMapping } = await supabaseServiceRole
        .from('org_telegram_groups')
        .select('org_id')
        .eq('tg_chat_id', group.tg_chat_id)
        .limit(1)
        .single();
      
      const orgId = orgMapping?.org_id || null;
      
      // Health check thresholds (in minutes)
      // These are more realistic for community groups with varying activity
      const DEGRADED_THRESHOLD = 6 * 60;   // 6 hours without activity = degraded
      const UNHEALTHY_THRESHOLD = 24 * 60; // 24 hours without activity = unhealthy
      
      let status = 'healthy';
      let minutesSinceSync = null;
      
      if (group.last_sync_at) {
        const lastSync = new Date(group.last_sync_at);
        const now = new Date();
        minutesSinceSync = Math.round((now.getTime() - lastSync.getTime()) / 60000);
        
        if (minutesSinceSync > UNHEALTHY_THRESHOLD) {
          // No activity for >24 hours = unhealthy
          status = 'unhealthy';
          unhealthyCount++;
        } else if (minutesSinceSync > DEGRADED_THRESHOLD) {
          // No activity for >6 hours = degraded
          status = 'degraded';
          degradedCount++;
        } else {
          // Activity within 6 hours = healthy
          healthyCount++;
        }
      } else {
        // No sync ever - check bot_status to determine if this is expected
        if (group.bot_status === 'active') {
          // Bot is active but never synced = unhealthy
          status = 'unhealthy';
          unhealthyCount++;
        } else {
          // Bot not active - this is expected, mark as degraded (not unhealthy)
          status = 'degraded';
          degradedCount++;
        }
        minutesSinceSync = null; // Unknown
      }
      
      // Log health event only for unhealthy groups (not degraded, to reduce spam)
      // Degraded is common for low-activity groups and doesn't require logging
      if (status === 'unhealthy') {
        const { error: healthLogError } = await supabaseServiceRole.rpc('log_telegram_health', {
          p_tg_chat_id: group.tg_chat_id,
          p_event_type: 'sync_failure',
          p_status: status,
          p_message: minutesSinceSync !== null
            ? `No activity for ${Math.round(minutesSinceSync / 60)} hours` 
            : 'No sync recorded (bot may not be active)',
          p_details: JSON.stringify({
            last_sync_at: group.last_sync_at,
            minutes_since_sync: minutesSinceSync,
            bot_status: group.bot_status
          }),
          p_org_id: orgId
        });
        
        if (healthLogError) {
          logger.error({ 
            tgChatId: group.tg_chat_id, 
            error: healthLogError 
          }, 'Failed to log health event');
        }
      }
      
      results.push({
        tg_chat_id: group.tg_chat_id,
        title: group.title,
        status,
        minutes_since_sync: minutesSinceSync
      });
    }
    
    logger.info({ 
      healthy: healthyCount, 
      degraded: degradedCount, 
      unhealthy: unhealthyCount 
    }, 'Health check complete');
    
    // Run cleanup functions (cleanup old logs)
    logger.info('Running cleanup functions');
    
    const [
      { data: idempotencyDeleted, error: idempotencyError },
      { data: healthDeleted, error: healthError },
      { data: errorLogsDeleted, error: errorLogsError }
    ] = await Promise.all([
      supabaseServiceRole.rpc('cleanup_webhook_idempotency'),
      supabaseServiceRole.rpc('cleanup_health_events'),
      supabaseServiceRole.rpc('cleanup_error_logs')
    ]);
    
    if (idempotencyError) logger.error({ error: idempotencyError }, 'Idempotency cleanup failed');
    if (healthError) logger.error({ error: healthError }, 'Health cleanup failed');
    if (errorLogsError) logger.error({ error: errorLogsError }, 'Error logs cleanup failed');
    
    const cleanupResults = [
      idempotencyDeleted || 0,
      healthDeleted || 0,
      errorLogsDeleted || 0
    ];
    
    logger.info({
      webhook_idempotency: cleanupResults[0],
      health_events: cleanupResults[1],
      error_logs: cleanupResults[2]
    }, 'Cleanup complete');
    
    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      checked: groups?.length || 0,
      summary: {
        healthy: healthyCount,
        degraded: degradedCount,
        unhealthy: unhealthyCount
      },
      results,
      cleanup: {
        webhook_idempotency_deleted: cleanupResults[0],
        health_events_deleted: cleanupResults[1],
        error_logs_deleted: cleanupResults[2]
      }
    });
  } catch (error) {
    logger.error({ error }, 'Unexpected error in health check cron');
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

