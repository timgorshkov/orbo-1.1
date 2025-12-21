import { NextRequest, NextResponse } from 'next/server';
import { createAPILogger } from '@/lib/logger';
import { sendTestEvent } from '@/lib/hawk';
import { isSuperadmin } from '@/lib/server/superadminGuard';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

const logger = createAPILogger({ headers: { get: () => null } }, { endpoint: 'hawk-test' });

export async function POST(request: NextRequest) {
  try {
    // Проверка авторизации суперадмина (unified auth + superadmins table)
    const isAdmin = await isSuperadmin();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    const user = await getUnifiedUser();
    const userId = user?.id || 'unknown';

    // Отправляем тестовое событие
    const success = sendTestEvent();
    
    if (success) {
      logger.info({ user_id: userId }, 'Hawk test event sent successfully');
      return NextResponse.json({ 
        success: true, 
        message: 'Test event sent to Hawk. Check Hawk dashboard in a few seconds.' 
      });
    } else {
      logger.warn({ user_id: userId }, 'Failed to send Hawk test event - not initialized');
      return NextResponse.json({ 
        success: false, 
        message: 'Hawk is not initialized. Check HAWK_TOKEN environment variable.' 
      }, { status: 500 });
    }
  } catch (error) {
    logger.error({ error }, 'Error sending Hawk test event');
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

