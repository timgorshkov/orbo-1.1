/**
 * Cron job: Check Groups Health
 * 
 * Periodically checks the health of all telegram groups:
 * - Verifies bot is still in the group
 * - Updates bot_status and is_archived accordingly
 * - Archives groups where bot has been removed
 * 
 * Runs daily via external cron scheduler
 * Authorization: CRON_SECRET
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createCronLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // Allow up to 2 minutes

interface GroupHealthResult {
  tg_chat_id: string;
  title: string;
  status: 'healthy' | 'bot_removed' | 'group_deleted' | 'error';
  error?: string;
}

export async function GET(request: NextRequest) {
  const logger = createCronLogger('check-groups-health');
  
  // Authorization check
  const cronSecretHeader = request.headers.get('x-cron-secret');
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const isValidCronSecret = cronSecretHeader === cronSecret;
    const isValidAuthHeader = authHeader === `Bearer ${cronSecret}`;
    
    if (!isValidCronSecret && !isValidAuthHeader) {
      const url = new URL(request.url);
      if (!url.hostname.includes('localhost') && url.hostname !== '127.0.0.1') {
        logger.warn({}, 'Unauthorized cron request');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
  }

  const startTime = Date.now();
  const results: GroupHealthResult[] = [];
  
  try {
    const supabase = createAdminServer();
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!botToken) {
      logger.error({}, 'TELEGRAM_BOT_TOKEN not configured');
      return NextResponse.json({ error: 'Bot token not configured' }, { status: 500 });
    }

    // Get all non-archived groups with active bot_status
    const { data: groups, error: fetchError } = await supabase
      .from('telegram_groups')
      .select('tg_chat_id, title, bot_status')
      .eq('bot_status', 'connected')
      .order('last_sync_at', { ascending: true, nullsFirst: true })
      .limit(50); // Process in batches to avoid timeout

    if (fetchError) {
      logger.error({ error: fetchError.message }, 'Error fetching groups');
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!groups || groups.length === 0) {
      logger.info({}, 'No groups to check');
      return NextResponse.json({ 
        success: true, 
        checked: 0, 
        healthy: 0, 
        archived: 0 
      });
    }

    logger.info({ count: groups.length }, 'Checking groups health');

    let healthyCount = 0;
    let archivedCount = 0;
    let errorCount = 0;

    for (const group of groups) {
      const chatId = group.tg_chat_id;
      
      try {
        // Check bot's membership in the chat using getChat
        const response = await fetch(
          `https://api.telegram.org/bot${botToken}/getChat?chat_id=${chatId}`,
          { method: 'GET' }
        );
        
        const data = await response.json();
        
        if (data.ok) {
          // Chat exists and bot can access it
          results.push({
            tg_chat_id: String(chatId),
            title: group.title || 'Unknown',
            status: 'healthy'
          });
          healthyCount++;
          
          // Update last_sync_at to mark as checked
          await supabase
            .from('telegram_groups')
            .update({ last_sync_at: new Date().toISOString() })
            .eq('tg_chat_id', chatId);
            
        } else {
          // Bot cannot access the chat
          const errorCode = data.error_code;
          const description = data.description || 'Unknown error';
          
          let archiveReason: string;
          let status: 'bot_removed' | 'group_deleted';
          
          if (errorCode === 400 && description.includes('chat not found')) {
            // Group was deleted
            archiveReason = 'group_deleted';
            status = 'group_deleted';
          } else if (errorCode === 403 || description.includes('bot was kicked') || description.includes('bot is not a member')) {
            // Bot was removed
            archiveReason = 'bot_removed';
            status = 'bot_removed';
          } else {
            // Other error - might be temporary
            archiveReason = `api_error: ${description}`;
            status = 'bot_removed';
          }
          
          logger.warn({
            chat_id: chatId,
            title: group.title,
            error_code: errorCode,
            description
          }, 'Group health check failed');
          
          // Archive the group
          await supabase
            .from('telegram_groups')
            .update({
              bot_status: 'inactive',
              is_archived: true,
              archived_at: new Date().toISOString(),
              archived_reason: archiveReason,
              last_sync_at: new Date().toISOString()
            })
            .eq('tg_chat_id', chatId);
          
          // Archive all org mappings
          await supabase
            .from('org_telegram_groups')
            .update({
              status: 'archived',
              archived_at: new Date().toISOString(),
              archived_reason: archiveReason
            })
            .eq('tg_chat_id', chatId)
            .eq('status', 'active');
          
          results.push({
            tg_chat_id: String(chatId),
            title: group.title || 'Unknown',
            status,
            error: description
          });
          archivedCount++;
        }
        
        // Rate limiting: wait 100ms between requests to avoid hitting Telegram limits
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({
          chat_id: chatId,
          title: group.title,
          error: errorMessage
        }, 'Error checking group health');
        
        results.push({
          tg_chat_id: String(chatId),
          title: group.title || 'Unknown',
          status: 'error',
          error: errorMessage
        });
        errorCount++;
      }
    }

    const durationMs = Date.now() - startTime;
    
    logger.info({
      checked: groups.length,
      healthy: healthyCount,
      archived: archivedCount,
      errors: errorCount,
      duration_ms: durationMs
    }, '✅ Groups health check complete');

    return NextResponse.json({
      success: true,
      checked: groups.length,
      healthy: healthyCount,
      archived: archivedCount,
      errors: errorCount,
      duration_ms: durationMs,
      results
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, '❌ Groups health check failed');
    
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
