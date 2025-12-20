import { NextRequest, NextResponse } from 'next/server';
import { createAPILogger } from '@/lib/logger';
import { sendTestEvent } from '@/lib/hawk';
import { createClient } from '@/lib/supabase/server';

const logger = createAPILogger({ headers: { get: () => null } }, { endpoint: 'hawk-test' });

export async function POST(request: NextRequest) {
  try {
    // Проверка авторизации суперадмина
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Проверка что пользователь - суперадмин
    const superadminEmails = (process.env.SUPERADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
    if (!superadminEmails.includes(user.email?.toLowerCase() || '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Отправляем тестовое событие
    const success = sendTestEvent();
    
    if (success) {
      logger.info({ user_id: user.id }, 'Hawk test event sent successfully');
      return NextResponse.json({ 
        success: true, 
        message: 'Test event sent to Hawk. Check Hawk dashboard in a few seconds.' 
      });
    } else {
      logger.warn({ user_id: user.id }, 'Failed to send Hawk test event - not initialized');
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

