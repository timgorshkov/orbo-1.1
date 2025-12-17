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
import { logErrorToDatabase } from '@/lib/logErrorToDatabase';
import { createCronLogger } from '@/lib/logger';

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
  const logger = createCronLogger('update-participant-roles');
  const startTime = Date.now();
  
  logger.info({}, 'Started');
  
  // Verify authorization
  if (!verifyCronAuth(request)) {
    logger.warn({}, 'Unauthorized request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    // Step 1: Fetch active participants
    logger.debug({}, 'Step 1: Fetching active participants');
    const participants = await getActiveParticipantsForEnrichment(100);
    logger.info({ participants_count: participants.length }, 'Found participants to enrich');
    
    if (participants.length === 0) {
      logger.info({}, 'No participants to enrich');
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
    
    logger.debug({}, 'Step 2: Enriching participants (rule-based, NO AI)');
    
    for (const participant of participants) {
      try {
        await enrichParticipant(participant.id, participant.org_id, {
          useAI: false,              // ❌ NO AI - rule-based only
          includeBehavior: true,     // ✅ Update behavioral_role
          includeReactions: true,    // ✅ Update reaction_patterns
          daysBack: 30               // Analyze last 30 days
        });
        
        results.success++;
      } catch (error) {
        results.failed++;
        const errorMsg = error instanceof Error ? error.message : String(error);
        results.errors.push(`Participant ${participant.id}: ${errorMsg}`);
        logger.error({ participant_id: participant.id, error: errorMsg }, 'Failed to enrich participant');
      }
    }
    
    const duration = Date.now() - startTime;
    
    // Log only if there were failures
    if (results.failed > 0) {
      await logErrorToDatabase({
        level: 'warn',
        message: `Daily role update had ${results.failed} failures out of ${participants.length} participants`,
        errorCode: 'CRON_ROLE_UPDATE_PARTIAL',
        context: {
          success_count: results.success,
          failed_count: results.failed,
          total_participants: participants.length,
          duration_ms: duration,
          errors: results.errors.slice(0, 10) // Keep first 10 errors
        }
      });
    }
    
    logger.info({ 
      success: results.success,
      failed: results.failed,
      duration_ms: duration
    }, 'Completed');
    
    return NextResponse.json({
      ok: true,
      updated: results.success,
      failed: results.failed,
      duration_ms: duration,
      errors: results.errors.slice(0, 5) // Return first 5 errors
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logger.error({ 
      error: errorMsg,
      stack: errorStack,
      duration_ms: duration
    }, 'Fatal error');
    
    // Log fatal error to database
    await logErrorToDatabase({
      level: 'error',
      message: `Daily role update failed: ${errorMsg}`,
      errorCode: 'CRON_ROLE_UPDATE_ERROR',
      context: {
        duration_ms: duration
      },
      stackTrace: errorStack
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
