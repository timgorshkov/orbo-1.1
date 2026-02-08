import { NextRequest, NextResponse } from 'next/server';
import { createServiceLogger } from '@/lib/logger';
import { logErrorToDatabase } from '@/lib/logErrorToDatabase';

const logger = createServiceLogger('ClientError');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { source, message, stack, digest, url, userAgent } = body;
    
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
