import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createCronLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for this cron job

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

/**
 * Cron job to update group metrics
 * Should be called every 5 minutes
 * 
 * This replaces the per-message updateGroupMetrics call for better performance
 */
export async function GET(request: NextRequest) {
  const logger = createCronLogger('update-group-metrics');
  const startTime = Date.now();
  
  // Verify cron secret
  const cronSecret = request.headers.get('x-cron-secret');
  if (cronSecret !== process.env.CRON_SECRET) {
    logger.warn('Unauthorized cron access attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    logger.info('Starting group metrics update');
    
    const today = new Date().toISOString().split('T')[0];
    
    // Get all active org-group mappings
    const { data: mappings, error: mappingsError } = await supabaseAdmin
      .from('org_telegram_groups')
      .select('org_id, tg_chat_id')
      .eq('status', 'active');
    
    if (mappingsError) {
      logger.error({ error: mappingsError.message }, 'Failed to fetch org mappings');
      return NextResponse.json({ error: 'Failed to fetch mappings' }, { status: 500 });
    }
    
    if (!mappings || mappings.length === 0) {
      logger.info('No active group mappings found');
      return NextResponse.json({ ok: true, updated: 0 });
    }
    
    logger.info({ count: mappings.length }, 'Found active group mappings');
    
    let updated = 0;
    let errors = 0;
    
    // Process each mapping
    for (const mapping of mappings) {
      try {
        const orgId = mapping.org_id;
        const chatId = mapping.tg_chat_id;
        
        // Get message count for today
        const { count: messageCount } = await supabaseAdmin
          .from('activity_events')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .eq('tg_chat_id', chatId)
          .eq('event_type', 'message')
          .gte('created_at', `${today}T00:00:00Z`)
          .lte('created_at', `${today}T23:59:59Z`);
        
        // Get reply count for today
        const { count: replyCount } = await supabaseAdmin
          .from('activity_events')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .eq('tg_chat_id', chatId)
          .eq('event_type', 'message')
          .not('reply_to_message_id', 'is', null)
          .gte('created_at', `${today}T00:00:00Z`)
          .lte('created_at', `${today}T23:59:59Z`);
        
        // Get DAU (distinct active users)
        const { data: dauData } = await supabaseAdmin
          .from('activity_events')
          .select('tg_user_id')
          .eq('org_id', orgId)
          .eq('tg_chat_id', chatId)
          .eq('event_type', 'message')
          .gte('created_at', `${today}T00:00:00Z`)
          .lte('created_at', `${today}T23:59:59Z`);
        
        const dau = new Set(dauData?.map(d => d.tg_user_id) || []).size;
        
        // Get join/leave counts
        const { count: joinCount } = await supabaseAdmin
          .from('activity_events')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .eq('tg_chat_id', chatId)
          .eq('event_type', 'join')
          .gte('created_at', `${today}T00:00:00Z`)
          .lte('created_at', `${today}T23:59:59Z`);
        
        const { count: leaveCount } = await supabaseAdmin
          .from('activity_events')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .eq('tg_chat_id', chatId)
          .eq('event_type', 'leave')
          .gte('created_at', `${today}T00:00:00Z`)
          .lte('created_at', `${today}T23:59:59Z`);
        
        const messages = messageCount || 0;
        const replies = replyCount || 0;
        const replyRatio = messages > 0 ? Math.round((replies / messages) * 100) : 0;
        const joins = joinCount || 0;
        const leaves = leaveCount || 0;
        
        // Upsert metrics
        const { error: upsertError } = await supabaseAdmin
          .from('group_metrics')
          .upsert({
            org_id: orgId,
            tg_chat_id: chatId,
            date: today,
            dau: dau,
            message_count: messages,
            reply_count: replies,
            reply_ratio: replyRatio,
            join_count: joins,
            leave_count: leaves,
            net_member_change: joins - leaves
          }, {
            onConflict: 'org_id,tg_chat_id,date'
          });
        
        if (upsertError) {
          logger.error({ 
            org_id: orgId, 
            chat_id: chatId, 
            error: upsertError.message 
          }, 'Failed to upsert metrics');
          errors++;
        } else {
          updated++;
        }
        
      } catch (err) {
        logger.error({ 
          error: err instanceof Error ? err.message : String(err)
        }, 'Error processing mapping');
        errors++;
      }
    }
    
    const duration = Date.now() - startTime;
    logger.info({ 
      updated, 
      errors, 
      total: mappings.length,
      duration_ms: duration 
    }, 'Group metrics update completed');
    
    return NextResponse.json({ 
      ok: true, 
      updated,
      errors,
      total: mappings.length,
      duration_ms: duration
    });
    
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error)
    }, 'Cron job failed');
    
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

