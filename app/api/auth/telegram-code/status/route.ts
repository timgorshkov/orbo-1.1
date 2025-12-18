import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// GET /api/auth/telegram-code/status?code=XXX - Check if code has been verified
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/auth/telegram-code/status' });
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.json(
        { error: 'Code is required' },
        { status: 400 }
      );
    }

    const adminSupabase = createAdminServer();

    // Check if code exists and is verified
    const { data: authCode, error } = await adminSupabase
      .from('telegram_auth_codes')
      .select('id, is_used, used_at, telegram_user_id')
      .eq('code', code.toUpperCase())
      .maybeSingle();

    if (error) {
      logger.error({ 
        error: error.message,
        code: code?.substring(0, 4) + '...'
      }, 'Error checking code status');
      return NextResponse.json(
        { error: 'Failed to check status' },
        { status: 500 }
      );
    }

    if (!authCode) {
      logger.debug({ code: code?.substring(0, 4) + '...' }, 'Code not found');
      return NextResponse.json(
        { verified: false, message: 'Code not found' },
        { status: 404 }
      );
    }

    // Check if code has been used (verified)
    const verified = authCode.is_used && !!authCode.telegram_user_id;

    logger.debug({ 
      verified,
      code_id: authCode.id
    }, 'Code status checked');
    return NextResponse.json({
      verified,
      used_at: authCode.used_at,
    });
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Error in status check');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

