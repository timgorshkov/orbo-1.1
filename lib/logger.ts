/**
 * Enhanced Logger for Node.js Runtime
 * 
 * This module re-exports logger-base and adds server-side error tracking.
 * For Edge Runtime or Client, use logger-base directly.
 */

// Re-export everything from base logger
export * from './logger-base';
export { logger, createAPILogger, createServiceLogger, createCronLogger, createClientLogger } from './logger-base';
export type { Logger } from './logger-base';

// Server-side error tracking is now handled separately via logErrorToDb() in API routes
// Import and use lib/services/errorLoggingService.ts directly where needed
