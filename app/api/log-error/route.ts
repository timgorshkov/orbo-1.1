import { NextRequest, NextResponse } from 'next/server';
import { createServiceLogger } from '@/lib/logger';

const logger = createServiceLogger('ClientError');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { source, message, stack, digest, url, userAgent } = body;
    
    logger.error({
      source: source || 'unknown',
      error_message: message,
      stack: stack,
      digest: digest,
      url: url,
      user_agent: userAgent,
    }, `Client-side error: ${message}`);
    
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
