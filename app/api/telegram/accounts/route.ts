import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClientServer } from '@/lib/server/supabaseServer';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('orgId');

    if (!orgId) {
      return NextResponse.json({ error: 'Missing orgId parameter' }, { status: 400 });
    }

    const supabase = await createClientServer();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Получаем Telegram аккаунт пользователя для данной организации
    const { data: telegramAccount, error } = await supabase
      .from('user_telegram_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Error fetching telegram account:', error);
      return NextResponse.json({ error: 'Failed to fetch telegram account' }, { status: 500 });
    }

    return NextResponse.json({ 
      telegramAccount: telegramAccount || null 
    });

  } catch (error: any) {
    console.error('Error in telegram accounts GET:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { orgId, telegramUserId, telegramUsername, telegramFirstName, telegramLastName } = body;

    if (!orgId || !telegramUserId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const supabase = await createClientServer();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Генерируем код верификации
    const verificationCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15); // Код действует 15 минут

    // Создаем или обновляем Telegram аккаунт
    const { data: telegramAccount, error } = await supabase
      .from('user_telegram_accounts')
      .upsert({
        user_id: user.id,
        org_id: orgId,
        telegram_user_id: telegramUserId,
        telegram_username: telegramUsername,
        telegram_first_name: telegramFirstName,
        telegram_last_name: telegramLastName,
        is_verified: false,
        verification_code: verificationCode,
        verification_expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,org_id'
      })
      .select()
      .single();

    if (error) {
      console.error('Error upserting telegram account:', error);
      return NextResponse.json({ error: 'Failed to save telegram account' }, { status: 500 });
    }

    // Логируем попытку верификации
    await supabase
      .from('telegram_verification_logs')
      .insert({
        user_id: user.id,
        org_id: orgId,
        telegram_user_id: telegramUserId,
        verification_code: verificationCode,
        action: 'request',
        success: true
      });

    // Отправляем код верификации через бота уведомлений
    try {
      // Используем сервисную роль для обхода ограничений Next.js при серверных вызовах API
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      
      if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Missing Supabase configuration');
      }
      
      // Инициализируем бота уведомлений напрямую
      const { TelegramService } = await import('@/lib/services/telegramService');
      const notificationsBot = new TelegramService('notifications');
      
      console.log(`Sending verification code to Telegram user ID: ${telegramUserId}`);
      
      const message = `🔐 *Код верификации Orbo*

Для подтверждения связи вашего Telegram аккаунта с организацией используйте код:

\`${verificationCode}\`

Введите этот код в веб-интерфейсе Orbo.

⏰ Код действителен 15 минут
🔒 Если вы не запрашивали этот код, проигнорируйте сообщение`;

      const result = await notificationsBot.sendMessage(telegramUserId, message, {
        parse_mode: 'Markdown'
      });
      
      console.log('Verification code send result:', result);
      
      if (!result.ok) {
        console.error('Failed to send verification code:', result);
        
        // Если пользователь не начал диалог с ботом
        if (result.description?.includes('chat not found') || 
            result.description?.includes('bot was blocked')) {
          return NextResponse.json({ 
            error: 'Please start a conversation with @orbo_assistant_bot first',
            code: 'BOT_BLOCKED'
          }, { status: 400 });
        }
      }
    } catch (notificationError: any) {
      console.error('Error sending verification code:', notificationError);
      
      // Если ошибка связана с отсутствием чата
      if (notificationError.message?.includes('chat not found') || 
          notificationError.message?.includes('bot was blocked')) {
        return NextResponse.json({ 
          error: 'Пожалуйста, сначала запустите диалог с @orbo_assistant_bot в Telegram',
          code: 'BOT_BLOCKED'
        }, { status: 400 });
      }
    }

    return NextResponse.json({ 
      telegramAccount: {
        ...telegramAccount,
        verification_code: undefined // Не возвращаем код в ответе
      },
      message: 'Verification code sent to your Telegram. Please check @orbo_assistant_bot'
    });

  } catch (error: any) {
    console.error('Error in telegram accounts POST:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { orgId, verificationCode } = body;

    if (!orgId || !verificationCode) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const supabase = await createClientServer();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Ищем аккаунт с данным кодом верификации
    const { data: telegramAccount, error: findError } = await supabase
      .from('user_telegram_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .eq('verification_code', verificationCode.toUpperCase())
      .gt('verification_expires_at', new Date().toISOString())
      .single();

    if (findError || !telegramAccount) {
      // Логируем неудачную попытку
      await supabase
        .from('telegram_verification_logs')
        .insert({
          user_id: user.id,
          org_id: orgId,
          verification_code: verificationCode,
          action: 'verify',
          success: false,
          error_message: 'Invalid or expired verification code'
        });

      return NextResponse.json({ 
        error: 'Invalid or expired verification code' 
      }, { status: 400 });
    }

    // Подтверждаем верификацию
    const { data: verifiedAccount, error: updateError } = await supabase
      .from('user_telegram_accounts')
      .update({
        is_verified: true,
        verified_at: new Date().toISOString(),
        verification_code: null,
        verification_expires_at: null
      })
      .eq('id', telegramAccount.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating telegram account:', updateError);
      return NextResponse.json({ error: 'Failed to verify account' }, { status: 500 });
    }

    // Логируем успешную верификацию
    await supabase
      .from('telegram_verification_logs')
      .insert({
        user_id: user.id,
        org_id: orgId,
        telegram_user_id: telegramAccount.telegram_user_id,
        verification_code: verificationCode,
        action: 'verify',
        success: true
      });

    return NextResponse.json({ 
      telegramAccount: verifiedAccount,
      message: 'Telegram account verified successfully!'
    });

  } catch (error: any) {
    console.error('Error in telegram accounts PUT:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
