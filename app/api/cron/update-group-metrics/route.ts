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
 * 
 * ВАЖНО: Метрики считаются по tg_chat_id (без фильтрации по org_id),
 * чтобы при добавлении группы в новую организацию вся история была видна.
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
      // Логируем только при отсутствии групп (редкое событие)
      logger.debug('No active group mappings found');
      return NextResponse.json({ ok: true, updated: 0 });
    }
    
    // Собираем уникальные chat_id и карту org -> chat_ids
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
    
    // Convert Set to Array for iteration
    const chatIdArray = Array.from(uniqueChatIds);
    
    let updated = 0;
    let errors = 0;
    
    // Process each unique chat_id
    for (const chatId of chatIdArray) {
      try {
        // Считаем метрики БЕЗ фильтрации по org_id
        // Это позволит видеть историю даже после добавления в новую организацию
        
        // Get message count for today
        const { count: messageCount } = await supabaseAdmin
          .from('activity_events')
          .select('*', { count: 'exact', head: true })
          .eq('tg_chat_id', chatId)
          .eq('event_type', 'message')
          .gte('created_at', `${today}T00:00:00Z`)
          .lte('created_at', `${today}T23:59:59Z`);
        
        // Get reply count for today
        const { count: replyCount } = await supabaseAdmin
          .from('activity_events')
          .select('*', { count: 'exact', head: true })
          .eq('tg_chat_id', chatId)
          .eq('event_type', 'message')
          .not('reply_to_message_id', 'is', null)
          .gte('created_at', `${today}T00:00:00Z`)
          .lte('created_at', `${today}T23:59:59Z`);
        
        // Get DAU (distinct active users)
        const { data: dauData } = await supabaseAdmin
          .from('activity_events')
          .select('tg_user_id')
          .eq('tg_chat_id', chatId)
          .eq('event_type', 'message')
          .gte('created_at', `${today}T00:00:00Z`)
          .lte('created_at', `${today}T23:59:59Z`);
        
        const dau = new Set(dauData?.map(d => d.tg_user_id) || []).size;
        
        // Get join/leave counts
        const { count: joinCount } = await supabaseAdmin
          .from('activity_events')
          .select('*', { count: 'exact', head: true })
          .eq('tg_chat_id', chatId)
          .eq('event_type', 'join')
          .gte('created_at', `${today}T00:00:00Z`)
          .lte('created_at', `${today}T23:59:59Z`);
        
        const { count: leaveCount } = await supabaseAdmin
          .from('activity_events')
          .select('*', { count: 'exact', head: true })
          .eq('tg_chat_id', chatId)
          .eq('event_type', 'leave')
          .gte('created_at', `${today}T00:00:00Z`)
          .lte('created_at', `${today}T23:59:59Z`);
        
        const messages = messageCount || 0;
        const replies = replyCount || 0;
        const replyRatio = messages > 0 ? Math.round((replies / messages) * 100) : 0;
        const joins = joinCount || 0;
        const leaves = leaveCount || 0;
        
        // Записываем метрики для КАЖДОЙ организации, к которой привязана группа
        const orgsForChat = chatToOrgs.get(chatId) || [];
        
        for (const orgId of orgsForChat) {
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
        }
        
      } catch (err) {
        logger.error({ 
          chat_id: chatId,
          error: err instanceof Error ? err.message : String(err)
        }, 'Error processing chat');
        errors++;
      }
    }
    
    const duration = Date.now() - startTime;
    
    // Логируем как info только при ошибках или медленном выполнении (>30s)
    // Иначе логируем как debug чтобы не засорять логи
    const logData = { 
      updated, 
      errors, 
      unique_chats: chatIdArray.length,
      duration_ms: duration 
    };
    
    if (errors > 0) {
      logger.warn(logData, 'Group metrics update completed with errors');
    } else if (duration > 30000) {
      logger.warn(logData, 'Group metrics update slow (>30s)');
    } else {
      logger.debug(logData, 'Group metrics update completed');
    }
    
    return NextResponse.json({ 
      ok: true, 
      updated,
      errors,
      unique_chats: chatIdArray.length,
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
