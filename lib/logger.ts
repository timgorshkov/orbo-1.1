import pino from 'pino';

// Create base logger instance
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  
  // Browser configuration (for Next.js client-side)
  browser: {
    asObject: true,
  },
  
  // Formatters
  formatters: {
    level: (label, number) => {
      // Return level as object with both label and number
      return { level: label };
    },
    bindings: (bindings) => ({
      pid: bindings.pid,
      hostname: bindings.hostname,
    }),
  },
  
  // Timestamp
  timestamp: pino.stdTimeFunctions.isoTime,
  
  // Use pino-pretty in development
  ...(process.env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    },
  }),
});

/**
 * Create a logger with additional context for API routes
 * 
 * @example
 * const log = createAPILogger(request, { orgId: '123' });
 * log.info('Processing request');
 * log.error({ error }, 'Request failed');
 */
export function createAPILogger(
  request: Request | { headers: { get: (key: string) => string | null } },
  context?: Record<string, any>
) {
  return logger.child({
    requestId: request.headers.get('x-vercel-id') || request.headers.get('x-request-id') || 'unknown',
    url: 'url' in request ? request.url : undefined,
    method: 'method' in request ? request.method : undefined,
    ...context,
  });
}

/**
 * Create a logger with service context
 * 
 * @example
 * const log = createServiceLogger('EnrichmentService', { orgId: '123' });
 * log.info('Starting enrichment');
 */
export function createServiceLogger(
  serviceName: string,
  context?: Record<string, any>
) {
  return logger.child({
    service: serviceName,
    ...context,
  });
}

/**
 * Create a logger for cron jobs
 * 
 * @example
 * const log = createCronLogger('telegram-health-check');
 * log.info('Cron job started');
 */
export function createCronLogger(
  cronName: string,
  context?: Record<string, any>
) {
  return logger.child({
    cron: cronName,
    ...context,
  });
}

// Export types for convenience
export type Logger = ReturnType<typeof logger.child>;

