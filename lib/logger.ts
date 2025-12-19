import pino from 'pino';

// Условный импорт Hawk только на сервере
let captureError: ((error: Error, context?: Record<string, unknown>) => void) | null = null;

if (typeof window === 'undefined') {
  // Динамический импорт только на сервере
  try {
    const hawkModule = require('./hawk');
    captureError = hawkModule.captureError;
    if (captureError) {
      console.log('[Logger] Hawk error capturing enabled');
    }
  } catch (e) {
    console.warn('[Logger] Hawk module not available:', e instanceof Error ? e.message : String(e));
  }
}

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
  
  // Hook для отправки ошибок и предупреждений в Hawk
  hooks: {
    logMethod(inputArgs, method, level) {
      // Если уровень warn (40) или выше - отправляем в Hawk (только на сервере)
      if (level >= 40 && typeof window === 'undefined' && captureError) {
        const [obj, msg] = inputArgs as [Record<string, unknown>, string?];
        
        // Собираем контекст для Hawk
        const context = typeof obj === 'object' ? { ...obj } : {};
        if (msg) context.message = msg;
        
        // Определяем Error объект или создаём его
        let error: Error;
        if (obj?.error instanceof Error) {
          error = obj.error;
        } else if (typeof obj?.error === 'string') {
          error = new Error(obj.error);
          if (obj.stack && typeof obj.stack === 'string') {
            error.stack = obj.stack;
          }
        } else if (obj?.stack && typeof obj.stack === 'string') {
          error = new Error(msg || String(obj?.msg) || 'Unknown error');
          error.stack = obj.stack;
        } else if (msg) {
          error = new Error(msg);
        } else if (typeof obj?.msg === 'string') {
          error = new Error(obj.msg);
        } else {
          error = new Error('Unknown error');
        }
        
        captureError(error, context);
      }
      return method.apply(this, inputArgs);
    },
  },
  
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

/**
 * Create a logger for client-side components
 * Works in browser and uses structured logging
 * 
 * @example
 * const log = createClientLogger('ComponentName');
 * log.info({ userId: '123' }, 'User action');
 * log.error({ error }, 'Component error');
 */
export function createClientLogger(
  componentName: string,
  context?: Record<string, any>
) {
  // In browser, pino will use browser mode automatically
  return logger.child({
    component: componentName,
    ...context,
  });
}

// Export types for convenience
export type Logger = ReturnType<typeof logger.child>;

