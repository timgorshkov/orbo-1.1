/**
 * Cron job: Check Notification Rules
 * 
 * Runs every 15 minutes via Vercel Cron / external scheduler
 * Processes all enabled notification rules:
 * - Negative discussion detection (AI)
 * - Unanswered questions detection (AI)
 * - Group inactivity detection
 * 
 * Authorization: CRON_SECRET
 */

import { NextRequest, NextResponse } from 'next/server';
import { processAllNotificationRules } from '@/lib/services/notificationRulesService';
import { createCronLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for processing

export async function GET(request: NextRequest) {
  const logger = createCronLogger('check-notification-rules');
  
  // Authorization check - support both x-cron-secret and authorization headers
  const cronSecretHeader = request.headers.get('x-cron-secret');
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const isValidCronSecret = cronSecretHeader === cronSecret;
    const isValidAuthHeader = authHeader === `Bearer ${cronSecret}`;
    
    if (!isValidCronSecret && !isValidAuthHeader) {
      // Allow localhost for testing
      const url = new URL(request.url);
      if (!url.hostname.includes('localhost') && url.hostname !== '127.0.0.1') {
        logger.warn({}, 'Unauthorized cron request');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
  }

  logger.debug({}, 'Notification rules check started');

  try {
    const startTime = Date.now();
    
    const result = await processAllNotificationRules();
    
    const durationMs = Date.now() - startTime;
    
    logger.debug({
      processed: result.processed,
      triggered: result.triggered,
      total_ai_cost_usd: result.totalAiCost,
      duration_ms: durationMs,
    }, '✅ Notification rules check complete');

    return NextResponse.json({
      success: true,
      processed: result.processed,
      triggered: result.triggered,
      totalAiCostUsd: result.totalAiCost,
      durationMs,
    });
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, '❌ Notification rules check failed');

    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

