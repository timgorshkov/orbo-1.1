import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createCronLogger } from '@/lib/logger';

// Service role client for bypassing RLS
const supabaseServiceRole = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false
    }
  }
);

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
      // Check if last_sync_at is stale (>15 minutes)
      let status = 'healthy';
      let minutesSinceSync = null;
      
      if (group.last_sync_at) {
        const lastSync = new Date(group.last_sync_at);
        const now = new Date();
        minutesSinceSync = Math.round((now.getTime() - lastSync.getTime()) / 60000);
        
        if (minutesSinceSync > 60) {
          // No activity for >1 hour = unhealthy
          status = 'unhealthy';
          unhealthyCount++;
        } else if (minutesSinceSync > 15) {
          // No activity for >15 minutes = degraded
          status = 'degraded';
          degradedCount++;
        } else {
          // Activity within 15 minutes = healthy
          healthyCount++;
        }
      } else {
        // No sync ever = unhealthy
        status = 'unhealthy';
        unhealthyCount++;
        minutesSinceSync = 99999; // Very large number
      }
      
      // Log health event if degraded or unhealthy
      if (status !== 'healthy') {
        const { error: healthLogError } = await supabaseServiceRole.rpc('log_telegram_health', {
          p_tg_chat_id: group.tg_chat_id,
          p_event_type: 'sync_failure',
          p_status: status,
          p_message: minutesSinceSync 
            ? `No activity for ${minutesSinceSync} minutes` 
            : 'No sync recorded',
          p_details: JSON.stringify({
            last_sync_at: group.last_sync_at,
            minutes_since_sync: minutesSinceSync
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

