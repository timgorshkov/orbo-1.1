import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createCronLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for backfill

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

/**
 * One-time backfill of group metrics for all historical data
 * This ensures groups added to new organizations show their full history
 * 
 * Usage: curl -H "x-cron-secret: $CRON_SECRET" "https://my.orbo.ru/api/cron/backfill-group-metrics?days=30"
 */
export async function GET(request: NextRequest) {
  const logger = createCronLogger('backfill-group-metrics');
  const startTime = Date.now();
  
  // Verify cron secret
  const cronSecret = request.headers.get('x-cron-secret');
  if (cronSecret !== process.env.CRON_SECRET) {
    logger.warn('Unauthorized backfill access attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const { searchParams } = new URL(request.url);
  const daysToBackfill = parseInt(searchParams.get('days') || '30');
  
  try {
    logger.info({ days: daysToBackfill }, 'Starting group metrics backfill');
    
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
    
    // Collect unique chat IDs and mapping to orgs
    const uniqueChatIds = new Set<string>();
    const chatToOrgs = new Map<string, string[]>();
    
    mappings.forEach(m => {
      const chatId = String(m.tg_chat_id);
      uniqueChatIds.add(chatId);
      
      if (!chatToOrgs.has(chatId)) {
        chatToOrgs.set(chatId, []);
      }
      chatToOrgs.get(chatId)!.push(m.org_id);
    });
    
    logger.info({ 
      unique_chats: uniqueChatIds.size,
      total_mappings: mappings.length,
      days: daysToBackfill
    }, 'Starting backfill');
    
    let totalUpdated = 0;
    let totalErrors = 0;
    
    // Process each day
    for (let dayOffset = 0; dayOffset < daysToBackfill; dayOffset++) {
      const date = new Date();
      date.setDate(date.getDate() - dayOffset);
      const dateStr = date.toISOString().split('T')[0];
      
      // Process each unique chat_id
      for (const chatId of uniqueChatIds) {
        try {
          // Get metrics for this day WITHOUT org_id filter
          const { count: messageCount } = await supabaseAdmin
            .from('activity_events')
            .select('*', { count: 'exact', head: true })
            .eq('tg_chat_id', chatId)
            .eq('event_type', 'message')
            .gte('created_at', `${dateStr}T00:00:00Z`)
            .lte('created_at', `${dateStr}T23:59:59Z`);
          
          const { count: replyCount } = await supabaseAdmin
            .from('activity_events')
            .select('*', { count: 'exact', head: true })
            .eq('tg_chat_id', chatId)
            .eq('event_type', 'message')
            .not('reply_to_message_id', 'is', null)
            .gte('created_at', `${dateStr}T00:00:00Z`)
            .lte('created_at', `${dateStr}T23:59:59Z`);
          
          const { data: dauData } = await supabaseAdmin
            .from('activity_events')
            .select('tg_user_id')
            .eq('tg_chat_id', chatId)
            .eq('event_type', 'message')
            .gte('created_at', `${dateStr}T00:00:00Z`)
            .lte('created_at', `${dateStr}T23:59:59Z`);
          
          const dau = new Set(dauData?.map(d => d.tg_user_id) || []).size;
          
          const { count: joinCount } = await supabaseAdmin
            .from('activity_events')
            .select('*', { count: 'exact', head: true })
            .eq('tg_chat_id', chatId)
            .eq('event_type', 'join')
            .gte('created_at', `${dateStr}T00:00:00Z`)
            .lte('created_at', `${dateStr}T23:59:59Z`);
          
          const { count: leaveCount } = await supabaseAdmin
            .from('activity_events')
            .select('*', { count: 'exact', head: true })
            .eq('tg_chat_id', chatId)
            .eq('event_type', 'leave')
            .gte('created_at', `${dateStr}T00:00:00Z`)
            .lte('created_at', `${dateStr}T23:59:59Z`);
          
          const messages = messageCount || 0;
          const replies = replyCount || 0;
          const replyRatio = messages > 0 ? Math.round((replies / messages) * 100) : 0;
          const joins = joinCount || 0;
          const leaves = leaveCount || 0;
          
          // Skip if no activity
          if (messages === 0 && joins === 0 && leaves === 0) {
            continue;
          }
          
          // Write metrics for ALL orgs linked to this chat
          const orgsForChat = chatToOrgs.get(chatId) || [];
          
          for (const orgId of orgsForChat) {
            const { error: upsertError } = await supabaseAdmin
              .from('group_metrics')
              .upsert({
                org_id: orgId,
                tg_chat_id: chatId,
                date: dateStr,
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
              totalErrors++;
            } else {
              totalUpdated++;
            }
          }
          
        } catch (err) {
          totalErrors++;
        }
      }
      
      // Log progress every 5 days
      if (dayOffset % 5 === 0) {
        logger.info({ 
          day: dayOffset + 1, 
          of: daysToBackfill,
          updated: totalUpdated,
          errors: totalErrors
        }, 'Backfill progress');
      }
    }
    
    const duration = Date.now() - startTime;
    logger.info({ 
      updated: totalUpdated, 
      errors: totalErrors, 
      days: daysToBackfill,
      duration_ms: duration 
    }, 'Backfill completed');
    
    return NextResponse.json({ 
      ok: true, 
      updated: totalUpdated,
      errors: totalErrors,
      days: daysToBackfill,
      duration_ms: duration
    });
    
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error)
    }, 'Backfill failed');
    
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

