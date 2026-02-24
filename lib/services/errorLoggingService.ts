/**
 * Error Logging Service
 * 
 * Logs errors to the PostgreSQL database for visibility in superadmin panel.
 * Uses batching to reduce database load.
 */

interface ErrorLogEntry {
  level: 'error' | 'warn' | 'info';
  message: string;
  error_code?: string;
  context?: Record<string, unknown>;
  stack_trace?: string;
  org_id?: string;
  user_id?: string;
  request_id?: string;
  user_agent?: string;
  fingerprint?: string;
}

// Queue for batch processing
let errorQueue: ErrorLogEntry[] = [];
let flushTimeout: NodeJS.Timeout | null = null;
const FLUSH_INTERVAL_MS = 5000; // Flush every 5 seconds
const MAX_QUEUE_SIZE = 50; // Flush if queue reaches this size

// Dynamic import of postgres client (only on server)
let pgClient: any = null;
let pgClientInitialized = false;

async function getPgClient() {
  if (typeof window !== 'undefined') return null;
  
  if (!pgClientInitialized) {
    pgClientInitialized = true;
    try {
      const { createPostgresClient } = await import('@/lib/db/postgres-client');
      pgClient = createPostgresClient();
    } catch (e) {
      console.warn('[ErrorLoggingService] Could not load postgres client:', e);
    }
  }
  return pgClient;
}

/**
 * Log an error to the database
 * Uses batching to reduce database load
 */
export function logErrorToDb(entry: ErrorLogEntry): void {
  // Skip if running in browser
  if (typeof window !== 'undefined') return;
  
  errorQueue.push(entry);
  
  // Flush immediately if queue is full
  if (errorQueue.length >= MAX_QUEUE_SIZE) {
    flushErrorQueue();
    return;
  }
  
  // Schedule flush if not already scheduled
  if (!flushTimeout) {
    flushTimeout = setTimeout(() => {
      flushErrorQueue();
    }, FLUSH_INTERVAL_MS);
  }
}

/**
 * Flush error queue to database
 */
async function flushErrorQueue(): Promise<void> {
  if (flushTimeout) {
    clearTimeout(flushTimeout);
    flushTimeout = null;
  }
  
  if (errorQueue.length === 0) return;
  
  const entries = [...errorQueue];
  errorQueue = [];
  
  try {
    const client = await getPgClient();
    if (!client) {
      console.warn('[ErrorLoggingService] PostgreSQL client not available, skipping flush');
      return;
    }
    
    // Deduplicate within the batch by fingerprint
    const seen = new Set<string>();
    const uniqueEntries = entries.filter(entry => {
      const fp = entry.fingerprint || generateFingerprint(entry);
      if (seen.has(fp)) return false;
      seen.add(fp);
      return true;
    });

    // Insert each unique entry (with DB-level dedup check)
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    for (const entry of uniqueEntries) {
      try {
        const fp = entry.fingerprint || generateFingerprint(entry);

        const { data: existing } = await client
          .from('error_logs')
          .select('id')
          .eq('fingerprint', fp)
          .gte('created_at', oneHourAgo.toISOString())
          .limit(1);

        if (existing && existing.length > 0) continue;

        await client
          .from('error_logs')
          .insert({
            level: entry.level,
            message: entry.message.substring(0, 1000),
            error_code: entry.error_code || null,
            context: entry.context || null,
            stack_trace: entry.stack_trace?.substring(0, 5000) || null,
            org_id: entry.org_id || null,
            user_id: entry.user_id || null,
            request_id: entry.request_id || null,
            user_agent: entry.user_agent?.substring(0, 500) || null,
            fingerprint: fp,
            created_at: new Date().toISOString()
          });
      } catch (e) {
        console.error('[ErrorLoggingService] Failed to insert error log:', e);
      }
    }
  } catch (e) {
    console.error('[ErrorLoggingService] Exception while flushing errors:', e);
  }
}

/**
 * Generate a fingerprint for deduplication
 */
function generateFingerprint(entry: ErrorLogEntry): string {
  const base = `${entry.level}:${entry.message}:${entry.error_code || ''}`;
  // Simple hash
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    const char = base.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

/**
 * Convenience function to log error from logger hooks
 */
export function logFromPino(
  level: number,
  obj: Record<string, unknown>,
  msg?: string
): void {
  // Map pino levels: 30=info, 40=warn, 50=error, 60=fatal
  let levelName: 'error' | 'warn' | 'info';
  if (level >= 50) {
    levelName = 'error';
  } else if (level >= 40) {
    levelName = 'warn';
  } else {
    levelName = 'info';
  }
  
  // Only log warn and error to DB
  if (level < 40) return;
  
  const message = msg || obj.msg as string || 'Unknown error';
  const errorCode = obj.error_code as string || obj.code as string;
  
  // Extract context
  const context: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!['msg', 'level', 'time', 'pid', 'hostname', 'error', 'stack'].includes(key)) {
      context[key] = value;
    }
  }
  
  // Extract error details
  let stackTrace: string | undefined;
  if (obj.error instanceof Error) {
    stackTrace = obj.error.stack;
  } else if (typeof obj.stack === 'string') {
    stackTrace = obj.stack;
  }
  
  logErrorToDb({
    level: levelName,
    message,
    error_code: errorCode,
    context: Object.keys(context).length > 0 ? context : undefined,
    stack_trace: stackTrace,
    org_id: obj.org_id as string,
    user_id: obj.user_id as string,
    request_id: obj.requestId as string || obj.request_id as string,
    user_agent: obj.userAgent as string || obj.user_agent as string,
  });
}

// Ensure queue is flushed on process exit
if (typeof process !== 'undefined' && process.on) {
  process.on('beforeExit', () => {
    flushErrorQueue();
  });
}
