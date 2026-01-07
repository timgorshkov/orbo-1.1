import pino from 'pino';

// Create base logger instance - safe for Edge Runtime and Client
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  
  // Browser configuration (for Next.js client-side)
  browser: {
    asObject: true,
  },
  
  // Formatters
  formatters: {
    level: (label) => {
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

/**
 * Create a logger for client-side components
 */
export function createClientLogger(
  componentName: string,
  context?: Record<string, any>
) {
  return logger.child({
    component: componentName,
    ...context,
  });
}

// Export types
export type Logger = ReturnType<typeof logger.child>;

