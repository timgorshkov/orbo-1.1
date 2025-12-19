import { NextRequest, NextResponse } from 'next/server';
import { createAPILogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface VitalsPayload {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  level: 'info' | 'warn' | 'error';
  pathname: string;
  id: string;
  timestamp: string;
}

/**
 * API endpoint для получения Web Vitals метрик от клиента
 * 
 * Логирует метрики производительности:
 * - info: нормальные значения
 * - warn: значения выше порогов (например LCP > 4s)
 * - error: критически плохие значения (например LCP > 10s)
 */
export async function POST(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'api/vitals' });
  
  try {
    const payload: VitalsPayload = await req.json();
    
    const { name, value, rating, level, pathname, id, timestamp } = payload;
    
    // Логируем в зависимости от уровня
    const logData = {
      metric: name,
      value,
      rating,
      pathname,
      metric_id: id,
      client_timestamp: timestamp,
    };
    
    if (level === 'error') {
      logger.error(logData, `Web Vitals CRITICAL: ${name}=${value}ms on ${pathname}`);
    } else if (level === 'warn') {
      logger.warn(logData, `Web Vitals SLOW: ${name}=${value}ms on ${pathname}`);
    } else {
      logger.debug(logData, `Web Vitals: ${name}=${value}ms`);
    }
    
    return NextResponse.json({ ok: true });
  } catch (error) {
    // Не логируем ошибки парсинга - это может быть спам
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

