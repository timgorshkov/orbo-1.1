/**
 * Participant Stats Service
 * 
 * Lightweight stats updates for webhook (NO AI, NO enrichment)
 * Only updates counters and timestamps.
 */

import { createAdminServer } from '@/lib/server/supabaseServer';

/**
 * Update participant's last activity timestamp
 * Called from webhook after processing message
 * 
 * This is a non-critical operation - if it fails, we just log a warning.
 * The main webhook processing should continue regardless.
 */
export async function updateParticipantActivity(
  tgUserId: number,
  orgId: string
): Promise<void> {
  // Use a simple retry mechanism for transient failures
  const maxRetries = 2;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Create admin client per request (important for serverless)
      const supabaseAdmin = createAdminServer();
      
      // Update last_activity_at (triggers scoring via DB trigger)
      const { error } = await supabaseAdmin
        .from('participants')
        .update({
          last_activity_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('tg_user_id', tgUserId)
        .eq('org_id', orgId);
      
      if (error) {
        // Log as warning, not error - this is non-critical
        console.warn('[Stats] Warning: Failed to update participant activity:', {
          attempt,
          tgUserId,
          orgId,
          message: error.message,
          code: error.code || ''
        });
        
        // Don't retry for specific error codes (e.g., not found)
        if (error.code === 'PGRST116' || error.code === '42P01') {
          break;
        }
        
        // Retry for transient errors
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 100 * attempt));
          continue;
        }
      } else {
        // Success - exit loop
        return;
      }
    } catch (error: any) {
      // Network/fetch errors - log as warning and possibly retry
      const errorMessage = error?.message || String(error);
      
      // Check if this is a transient error worth retrying
      const isTransient = errorMessage.includes('fetch failed') || 
                          errorMessage.includes('ECONNRESET') ||
                          errorMessage.includes('timeout');
      
      console.warn('[Stats] Warning: Participant activity update failed:', {
        attempt,
        tgUserId,
        orgId,
        error: errorMessage,
        willRetry: isTransient && attempt < maxRetries
      });
      
      if (isTransient && attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100 * attempt));
        continue;
      }
      
      // Final attempt failed - just log and return
      break;
    }
  }
}

/**
 * Increment message counter for group
 * Called from webhook after processing message
 */
export async function incrementGroupMessageCount(
  tgChatId: number
): Promise<void> {
  try {
    // Create admin client per request (important for serverless)
    const supabaseAdmin = createAdminServer();
    
    // Group member_count is auto-updated by trigger
    // No need to manually increment
    
    // Update last_sync_at
    const { error } = await supabaseAdmin
      .from('telegram_groups')
      .update({
        last_sync_at: new Date().toISOString()
      })
      .eq('tg_chat_id', tgChatId);
    
    if (error) {
      console.error('[Stats] Failed to update group sync time:', error);
    }
  } catch (error) {
    console.error('[Stats] Error updating group sync time:', error);
  }
}

/**
 * Batch update participant activities (for cron or bulk operations)
 * Used by daily cron job to update roles
 */
export async function getActiveParticipantsForEnrichment(
  limit: number = 100
): Promise<Array<{ id: string; org_id: string; tg_user_id: number }>> {
  try {
    // Create admin client per request (important for serverless)
    const supabaseAdmin = createAdminServer();
    
    // Get participants who:
    // 1. Were active in last 7 days
    // 2. Haven't been enriched in last 24 hours (or never)
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);
    
    const { data, error } = await supabaseAdmin
      .from('participants')
      .select('id, org_id, tg_user_id, custom_attributes')
      .gte('last_activity_at', sevenDaysAgo.toISOString())
      .order('last_activity_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('[Stats] Failed to fetch active participants:', error);
      return [];
    }
    
    // Filter by last_enriched_at
    const filtered = (data || []).filter(p => {
      const lastEnriched = p.custom_attributes?.last_enriched_at;
      if (!lastEnriched) return true; // Never enriched
      return new Date(lastEnriched) < oneDayAgo; // Enriched >24h ago
    });
    
    return filtered.map(p => ({
      id: p.id,
      org_id: p.org_id,
      tg_user_id: p.tg_user_id
    }));
  } catch (error) {
    console.error('[Stats] Error fetching active participants:', error);
    return [];
  }
}

/**
 * Get stats for monitoring dashboard
 */
export async function getEnrichmentStats(): Promise<{
  total_participants: number;
  enriched_participants: number;
  enriched_with_ai: number;
  avg_enrichment_age_hours: number;
}> {
  try {
    // Create admin client per request (important for serverless)
    const supabaseAdmin = createAdminServer();
    
    const { data: stats } = await supabaseAdmin.rpc('get_enrichment_stats');
    
    if (stats) {
      return stats;
    }
    
    // Fallback: calculate manually
    const { data: allParticipants } = await supabaseAdmin
      .from('participants')
      .select('id, custom_attributes');
    
    const total = allParticipants?.length || 0;
    const enriched = allParticipants?.filter(p => p.custom_attributes?.last_enriched_at).length || 0;
    const enrichedWithAI = allParticipants?.filter(p => p.custom_attributes?.enrichment_source === 'ai').length || 0;
    
    // Calculate average age
    const enrichedRecords = allParticipants?.filter(p => p.custom_attributes?.last_enriched_at) || [];
    const avgAge = enrichedRecords.length > 0
      ? enrichedRecords.reduce((sum, p) => {
          const age = Date.now() - new Date(p.custom_attributes.last_enriched_at).getTime();
          return sum + age;
        }, 0) / enrichedRecords.length / (1000 * 60 * 60) // Convert to hours
      : 0;
    
    return {
      total_participants: total,
      enriched_participants: enriched,
      enriched_with_ai: enrichedWithAI,
      avg_enrichment_age_hours: avgAge
    };
  } catch (error) {
    console.error('[Stats] Error getting enrichment stats:', error);
    return {
      total_participants: 0,
      enriched_participants: 0,
      enriched_with_ai: 0,
      avg_enrichment_age_hours: 0
    };
  }
}

