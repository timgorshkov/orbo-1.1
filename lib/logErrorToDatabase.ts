import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false
    }
  }
);

export interface LogErrorOptions {
  level: 'error' | 'warn' | 'info';
  message: string;
  errorCode?: string;
  context?: Record<string, any>;
  stackTrace?: string;
  requestId?: string;
  orgId?: string;
  userId?: string;
}

/**
 * Log error to database (error_logs table)
 * 
 * This function is called for critical errors that need to be tracked in the dashboard.
 * 
 * @example
 * await logErrorToDatabase({
 *   level: 'error',
 *   message: 'Failed to process webhook',
 *   errorCode: 'WEBHOOK_FAILURE',
 *   context: { tg_chat_id: -123456 },
 *   stackTrace: error.stack,
 *   requestId: 'abc123'
 * });
 */
export async function logErrorToDatabase(options: LogErrorOptions): Promise<void> {
  try {
    const {
      level,
      message,
      errorCode,
      context,
      stackTrace,
      requestId,
      orgId,
      userId
    } = options;

    // Generate fingerprint for deduplication
    // Fingerprint = hash of (error_code + message + service/endpoint)
    const fingerprintSource = [
      errorCode || '',
      message,
      context?.service || context?.webhook || context?.cron || context?.endpoint || ''
    ].join('|');
    
    const fingerprint = crypto
      .createHash('sha256')
      .update(fingerprintSource)
      .digest('hex')
      .substring(0, 16);

    // Insert error log
    const { error } = await supabaseAdmin
      .from('error_logs')
      .insert({
        level,
        message,
        error_code: errorCode,
        context,
        stack_trace: stackTrace,
        fingerprint,
        request_id: requestId,
        org_id: orgId || null,
        user_id: userId || null,
      });

    if (error) {
      // If logging to database fails, log to console (fallback)
      console.error('[logErrorToDatabase] Failed to log error to database:', error);
    }
  } catch (err) {
    // Silent fail - don't throw errors from error logging
    console.error('[logErrorToDatabase] Exception while logging error:', err);
  }
}

/**
 * Helper: Log error with automatic context extraction from logger
 * 
 * @example
 * const logger = createAPILogger(req, { webhook: 'main' });
 * 
 * try {
 *   // ... some code
 * } catch (error) {
 *   logger.error({ error }, 'Webhook processing failed');
 *   await logErrorFromLogger(logger, error, {
 *     errorCode: 'WEBHOOK_FAILURE',
 *     message: 'Webhook processing failed'
 *   });
 * }
 */
export async function logErrorFromLogger(
  logger: any,
  error: Error | any,
  options: {
    errorCode?: string;
    message?: string;
    level?: 'error' | 'warn' | 'info';
  }
): Promise<void> {
  const bindings = logger.bindings?.() || {};
  
  await logErrorToDatabase({
    level: options.level || 'error',
    message: options.message || error.message || 'Unknown error',
    errorCode: options.errorCode,
    context: {
      ...bindings,
      errorName: error.name,
      errorMessage: error.message,
    },
    stackTrace: error.stack,
    requestId: bindings.requestId,
    orgId: bindings.orgId,
    userId: bindings.userId,
  });
}

