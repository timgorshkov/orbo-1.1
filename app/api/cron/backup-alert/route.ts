import { NextRequest, NextResponse } from 'next/server';
import { createPostgresClient } from '@/lib/db/postgres-client';
import { createAPILogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * POST /api/cron/backup-alert
 * Receives backup status alerts from backup.sh script
 */
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { cron: 'backup-alert' });
  
  try {
    // Verify cron secret
    const cronSecret = request.headers.get('x-cron-secret');
    if (cronSecret !== process.env.CRON_SECRET) {
      logger.warn({}, 'Invalid cron secret for backup alert');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    const { status, message, backup_size, timestamp } = body;
    
    // Log the alert
    if (status === 'error') {
      logger.error({ 
        backup_status: status,
        backup_message: message,
        backup_size,
        backup_timestamp: timestamp
      }, '🚨 BACKUP FAILED');
      
      // Log to error_logs table for visibility in superadmin
      const db = createPostgresClient();
      await db
        .from('error_logs')
        .insert({
          level: 'error',
          message: `Backup failed: ${message}`,
          error_code: 'BACKUP_FAILED',
          context: { status, message, backup_size, timestamp, service: 'backup' },
          created_at: new Date().toISOString()
        });
        
    } else {
      logger.info({ 
        backup_status: status,
        backup_message: message,
        backup_size,
        backup_timestamp: timestamp
      }, '✅ Backup completed successfully');
    }
    
    return NextResponse.json({ success: true, received: { status, message } });
    
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Error processing backup alert');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
