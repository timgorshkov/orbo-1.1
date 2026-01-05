/**
 * Performance timing utilities for diagnosing slow requests
 * 
 * Usage:
 *   const timing = new RequestTiming('EventDetailPage');
 *   timing.mark('db_fetch_start');
 *   const data = await supabase.from('events').select('*');
 *   timing.mark('db_fetch_end');
 *   timing.measure('supabase_fetch', 'db_fetch_start', 'db_fetch_end');
 *   
 *   // Log all timings
 *   timing.logSummary(logger);
 */

import { Logger } from 'pino';

export class RequestTiming {
  private name: string;
  private marks: Map<string, number> = new Map();
  private measures: Map<string, number> = new Map();
  private startTime: number;

  constructor(name: string) {
    this.name = name;
    this.startTime = performance.now();
  }

  /**
   * Mark a point in time
   */
  mark(name: string): void {
    this.marks.set(name, performance.now());
  }

  /**
   * Measure time between two marks
   */
  measure(name: string, startMark: string, endMark: string): number {
    const start = this.marks.get(startMark);
    const end = this.marks.get(endMark);
    
    if (start === undefined || end === undefined) {
      // Silent fail - don't pollute logs with timing issues
      return 0;
    }
    
    const duration = end - start;
    this.measures.set(name, duration);
    return duration;
  }

  /**
   * Wrap an async operation with timing
   */
  async time<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const startMark = `${name}_start`;
    const endMark = `${name}_end`;
    
    this.mark(startMark);
    try {
      const result = await operation();
      return result;
    } finally {
      this.mark(endMark);
      this.measure(name, startMark, endMark);
    }
  }

  /**
   * Get total elapsed time
   */
  totalTime(): number {
    return performance.now() - this.startTime;
  }

  /**
   * Get all measures as object
   */
  getMeasures(): Record<string, number> {
    const result: Record<string, number> = {};
    this.measures.forEach((value, key) => {
      result[key] = Math.round(value);
    });
    result['total'] = Math.round(this.totalTime());
    return result;
  }

  /**
   * Log summary to logger
   */
  logSummary(logger: Logger, threshold: number = 100): void {
    const measures = this.getMeasures();
    const total = measures['total'];
    
    // Only log if total time exceeds threshold
    if (total < threshold) {
      return;
    }

    // Find slowest operation
    let slowest = '';
    let slowestTime = 0;
    for (const [key, value] of Object.entries(measures)) {
      if (key !== 'total' && value > slowestTime) {
        slowest = key;
        slowestTime = value;
      }
    }

    const level = total > 3000 ? 'warn' : 'info';
    
    logger[level]({
      timing: measures,
      slowest_operation: slowest,
      slowest_ms: Math.round(slowestTime),
      total_ms: Math.round(total),
    }, `[Timing] ${this.name}: ${Math.round(total)}ms (slowest: ${slowest}=${Math.round(slowestTime)}ms)`);
  }

  /**
   * Create Server-Timing header value
   * Can be added to response headers for browser DevTools
   */
  toServerTimingHeader(): string {
    const parts: string[] = [];
    this.measures.forEach((value, key) => {
      parts.push(`${key};dur=${Math.round(value)}`);
    });
    parts.push(`total;dur=${Math.round(this.totalTime())}`);
    return parts.join(', ');
  }
}

/**
 * Simple one-shot timer for quick measurements
 */
export function createTimer(): () => number {
  const start = performance.now();
  return () => Math.round(performance.now() - start);
}

/**
 * Helper to add timing to API response
 */
export function withTiming<T extends Record<string, any>>(
  data: T,
  timing: RequestTiming
): T & { _timing?: Record<string, number> } {
  if (process.env.NODE_ENV === 'development') {
    return { ...data, _timing: timing.getMeasures() };
  }
  return data;
}

