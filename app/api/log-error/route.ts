import { NextRequest, NextResponse } from 'next/server';
import { createServiceLogger } from '@/lib/logger';
import { logErrorToDatabase } from '@/lib/logErrorToDatabase';

const logger = createServiceLogger('ClientError');

const BOT_UA_PATTERNS = /YandexBot|Googlebot|bingbot|DuckDuckBot|Baiduspider|facebookexternalhit|Twitterbot|LinkedInBot|Slurp|AhrefsBot|SemrushBot/i;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { source, message, stack, digest, url, userAgent } = body;

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
