/**
 * Cron: Cleanup webhook idempotency records
 * 
 * Schedule: Every hour
 * Purpose: Remove old idempotency records (>7 days) to keep table size manageable
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabaseAdmin = createAdminServer();

export async function GET(req: NextRequest) {
  const logger = createAPILogger(req, { cron: 'cleanup-idempotency' });
  const startTime = Date.now();
  
  try {
    logger.info('Starting idempotency cleanup');
    
    // Call cleanup function with 7 day retention
    const { data: deletedCount, error } = await supabaseAdmin.rpc(
      'cleanup_webhook_idempotency',
      { p_retention_days: 7 }
    );
    
    if (error) {
      logger.error({ error: error.message }, 'Cleanup RPC failed');
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    const duration = Date.now() - startTime;
    
    logger.info({ 
      deleted_count: deletedCount,
      duration_ms: duration
    }, 'Idempotency cleanup completed');
    
    return NextResponse.json({
      success: true,
      deleted_count: deletedCount,
      duration_ms: duration
    });
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error({ 
      error: error.message,
      duration_ms: duration
    }, 'Cleanup exception');
    
    return NextResponse.json({
      error: error.message || 'Internal error'
    }, { status: 500 });
  }
}

// Also support POST for manual triggers
export async function POST(req: NextRequest) {
  return GET(req);
}

