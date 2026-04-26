import { NextRequest, NextResponse } from 'next/server';
import { createServiceLogger } from '@/lib/logger';
import { logErrorToDatabase } from '@/lib/logErrorToDatabase';

const logger = createServiceLogger('ClientError');

const BOT_UA_PATTERNS = /YandexBot|Googlebot|bingbot|DuckDuckBot|Baiduspider|facebookexternalhit|Twitterbot|LinkedInBot|Slurp|AhrefsBot|SemrushBot/i;

const MAX_FIELD_LENGTH = 2000;
const MAX_STACK_LENGTH = 5000;
const ipBuckets = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const bucket = ipBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    ipBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  bucket.count++;
  return bucket.count > RATE_LIMIT;
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (isRateLimited(ip)) {
      return NextResponse.json({ ok: false, error: 'Too many requests' }, { status: 429 });
    }

    const body = await request.json();
    const { source, digest, url, userAgent } = body;
    const message = typeof body.message === 'string' ? body.message.slice(0, MAX_FIELD_LENGTH) : '';
    const stack = typeof body.stack === 'string' ? body.stack.slice(0, MAX_STACK_LENGTH) : undefined;

    // Skip ChunkLoadErrors from bots — they're caused by stale cached chunk URLs after deploy
    if (BOT_UA_PATTERNS.test(userAgent || '') && message?.includes('Loading chunk')) {
      return NextResponse.json({ ok: true });
    }

    // Log to pino (console/stdout)
    logger.error({
      source: source || 'unknown',
      error_message: message,
      stack: stack,
      digest: digest,
      url: url,
      user_agent: userAgent,
    }, `Client-side error: ${message}`);
    
    // Persist to error_logs table for superadmin dashboard
    await logErrorToDatabase({
      level: 'error',
      message: message || 'Unknown client error',
      errorCode: digest ? `CLIENT_${digest}` : 'CLIENT_ERROR',
      context: {
        source: source || 'unknown',
        url,
        userAgent,
        digest,
      },
      stackTrace: stack,
    });
    
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
