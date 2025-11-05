/**
 * Daily Cron Job: Update Participant Roles
 * 
 * Runs: Daily at 3 AM
 * Purpose: Update behavioral roles and reaction patterns for active participants
 * Cost: $0 (rule-based, NO AI)
 * 
 * Process:
 * 1. Fetch active participants (last 7 days)
 * 2. For each participant (limit 100/day):
 *    - Run rule-based enrichment (NO AI)
 *    - Update behavioral_role
 *    - Update reaction_patterns
 * 3. Log results for monitoring
 */

import { NextRequest, NextResponse } from 'next/server';
import { getActiveParticipantsForEnrichment } from '@/lib/services/participantStatsService';
import { enrichParticipant } from '@/lib/services/participantEnrichmentService';
import { createAdminServer } from '@/lib/server/supabaseServer';

const supabaseAdmin = createAdminServer();

export const dynamic = 'force-dynamic';

/**
 * Verify that the request is from Vercel Cron (production) or has correct auth (development)
 */
function verifyCronAuth(request: NextRequest): boolean {
  // Production: Verify Vercel Cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }
  
  // Development: Allow localhost
  const host = request.headers.get('host');
  if (host?.includes('localhost') || host?.includes('127.0.0.1')) {
    return true;
  }
  
  return false;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  console.log('[Cron: Update Roles] ==================== STARTED ====================');
  
  // Verify authorization
  if (!verifyCronAuth(request)) {
    console.error('[Cron: Update Roles] ❌ Unauthorized request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    // Step 1: Fetch active participants
    console.log('[Cron: Update Roles] Step 1: Fetching active participants...');
    const participants = await getActiveParticipantsForEnrichment(100);
    console.log(`[Cron: Update Roles] Found ${participants.length} participants to enrich`);
    
    if (participants.length === 0) {
      console.log('[Cron: Update Roles] ✅ No participants to enrich');
      return NextResponse.json({
        ok: true,
        updated: 0,
        duration_ms: Date.now() - startTime
      });
    }
    
    // Step 2: Enrich each participant (rule-based only)
    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[]
    };
    
    console.log('[Cron: Update Roles] Step 2: Enriching participants (rule-based, NO AI)...');
    
    for (const participant of participants) {
      try {
        console.log(`[Cron: Update Roles] Enriching participant ${participant.id}...`);
        
        await enrichParticipant(participant.id, participant.org_id, {
          useAI: false,              // ❌ NO AI - rule-based only
          includeBehavior: true,     // ✅ Update behavioral_role
          includeReactions: true,    // ✅ Update reaction_patterns
          daysBack: 30               // Analyze last 30 days
        });
        
        results.success++;
        console.log(`[Cron: Update Roles] ✅ Enriched participant ${participant.id}`);
      } catch (error) {
        results.failed++;
        const errorMsg = error instanceof Error ? error.message : String(error);
        results.errors.push(`Participant ${participant.id}: ${errorMsg}`);
        console.error(`[Cron: Update Roles] ❌ Failed to enrich participant ${participant.id}:`, error);
      }
    }
    
    const duration = Date.now() - startTime;
    
    // Step 3: Log results to database
    console.log('[Cron: Update Roles] Step 3: Logging results...');
    const { error: logError } = await supabaseAdmin
      .from('error_logs')
      .insert({
        level: 'info',
        message: `Daily role update completed: ${results.success} success, ${results.failed} failed`,
        context: {
          success_count: results.success,
          failed_count: results.failed,
          total_participants: participants.length,
          duration_ms: duration,
          errors: results.errors.slice(0, 10) // Keep first 10 errors
        }
      });
    
    if (logError) {
      console.error('[Cron: Update Roles] Failed to log results:', logError);
    }
    
    console.log('[Cron: Update Roles] ==================== COMPLETED ====================');
    console.log(`[Cron: Update Roles] Success: ${results.success}, Failed: ${results.failed}, Duration: ${duration}ms`);
    
    return NextResponse.json({
      ok: true,
      updated: results.success,
      failed: results.failed,
      duration_ms: duration,
      errors: results.errors.slice(0, 5) // Return first 5 errors
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[Cron: Update Roles] ❌ Fatal error:', error);
    
    // Log fatal error to database
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    await supabaseAdmin
      .from('error_logs')
      .insert({
        level: 'critical',
        message: `Daily role update failed: ${errorMsg}`,
        stack_trace: errorStack,
        context: {
          duration_ms: duration
        }
      });
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: errorMsg,
        duration_ms: duration
      },
      { status: 500 }
    );
  }
}

