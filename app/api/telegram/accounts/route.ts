import { NextResponse } from 'next/server';
// Removed unused Supabase import
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const logger = createAPILogger(request, { endpoint: '/api/telegram/accounts' });
  try {
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('orgId');

    if (!orgId) {
      return NextResponse.json({ error: 'Missing orgId parameter' }, { status: 400 });
    }

    const user = await getUnifiedUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminSupabase = createAdminServer();

    // Получаем Telegram аккаунт пользователя для данной организации
    const { data: telegramAccount, error } = await adminSupabase
      .from('user_telegram_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      logger.error({ error: error.message, user_id: user.id, org_id: orgId }, 'Error fetching telegram account');
      return NextResponse.json({ error: 'Failed to fetch telegram account' }, { status: 500 });
    }

    return NextResponse.json({ 
      telegramAccount: telegramAccount || null 
    });

  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Error in telegram accounts GET');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const logger = createAPILogger(request, { endpoint: '/api/telegram/accounts' });
  try {
    const body = await request.json();
    const { orgId, telegramUserId, telegramUsername, telegramFirstName, telegramLastName } = body;

    if (!orgId || !telegramUserId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const user = await getUnifiedUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const supabase = createAdminServer();

    // Пытаемся автоматически получить информацию о пользователе через Telegram API
    let fetchedUsername = telegramUsername;
    let fetchedFirstName = telegramFirstName;
    let fetchedLastName = telegramLastName;
    
    try {
      const { TelegramService } = await import('@/lib/services/telegramService');
      const notificationsBot = new TelegramService('notifications');
      
      // Получаем информацию о пользователе из Telegram
      const chatInfo = await notificationsBot.getChat(telegramUserId);
      
      if (chatInfo.ok && chatInfo.result) {
        fetchedUsername = chatInfo.result.username || telegramUsername;
        fetchedFirstName = chatInfo.result.first_name || telegramFirstName;
        fetchedLastName = chatInfo.result.last_name || telegramLastName;
        logger.debug({ username: fetchedUsername, telegram_user_id: telegramUserId }, 'Fetched user info from Telegram');
      }
    } catch (error) {
      logger.debug({ 
        error: error instanceof Error ? error.message : String(error),
        telegram_user_id: telegramUserId
      }, 'Could not fetch user info from Telegram, using provided values');
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
        telegram_username: fetchedUsername,
        telegram_first_name: fetchedFirstName,
        telegram_last_name: fetchedLastName,
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
      logger.error({ error: error.message, user_id: user.id, org_id: orgId }, 'Error upserting telegram account');
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
      const { TelegramService } = await import('@/lib/services/telegramService');
      const notificationsBot = new TelegramService('notifications');
      
      logger.info({ telegram_user_id: telegramUserId }, 'Sending verification code');
      
      const message = `🔐 *Код верификации Orbo*

Для подтверждения связи вашего Telegram аккаунта с организацией используйте код:

\`${verificationCode}\`

Введите этот код в веб-интерфейсе Orbo.

⏰ Код действителен 15 минут
🔒 Если вы не запрашивали этот код, проигнорируйте сообщение`;

      const result = await notificationsBot.sendMessage(telegramUserId, message, {
        parse_mode: 'Markdown'
      });
      
      logger.debug({ telegram_user_id: telegramUserId, result_ok: result.ok }, 'Verification code send result');
      
      if (!result.ok) {
        // Если пользователь не начал диалог с ботом — ожидаемое поведение, не ошибка
        if (result.description?.includes('chat not found') ||
            result.description?.includes('bot was blocked')) {
          logger.warn({ telegram_user_id: telegramUserId, error: result.description }, 'Verification code not sent: user has not started the bot');
          return NextResponse.json({
            error: 'Please start a conversation with @orbo_assistant_bot first',
            code: 'BOT_BLOCKED'
          }, { status: 400 });
        }
        logger.error({ telegram_user_id: telegramUserId, error: result.description }, 'Failed to send verification code');
      }
    } catch (notificationError: any) {
      logger.error({ 
        error: notificationError.message || String(notificationError),
        stack: notificationError.stack,
        telegram_user_id: telegramUserId
      }, 'Error sending verification code');
      
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
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Error in telegram accounts POST');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const logger = createAPILogger(request, { endpoint: '/api/telegram/accounts' });
  try {
    const body = await request.json();
    const { orgId, verificationCode } = body;

    if (!orgId || !verificationCode) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const user = await getUnifiedUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const supabase = createAdminServer();

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
      logger.error({ error: updateError.message, account_id: telegramAccount.id }, 'Error updating telegram account');
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

    // Sync to CRM (non-blocking)
    import('@/lib/services/weeekService').then(({ onTelegramLinked }) => {
      onTelegramLinked(user.id, telegramAccount.telegram_username).catch(() => {});
    }).catch(() => {});

    // Notify sales team about new Telegram linkage (non-blocking)
    Promise.all([
      supabase.from('users').select('name, email').eq('id', user.id).single(),
      supabase.from('organizations').select('name').eq('id', orgId).single()
    ]).then(async ([{ data: userData }, { data: orgData }]) => {
      const { sendSalesNotificationTelegramLinked } = await import('@/lib/services/email');
      await sendSalesNotificationTelegramLinked({
        userName: userData?.name || '',
        userEmail: userData?.email || null,
        telegramUsername: telegramAccount.telegram_username || null,
        telegramUserId: telegramAccount.telegram_user_id,
        orgName: orgData?.name || orgId,
        orgId,
        userId: user.id
      });
    }).catch(() => {});

    return NextResponse.json({
      telegramAccount: verifiedAccount,
      message: 'Telegram account verified successfully!'
    });

  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Error in telegram accounts PUT');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const logger = createAPILogger(request, { endpoint: '/api/telegram/accounts' });
  try {
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('orgId');

    if (!orgId) {
      return NextResponse.json({ error: 'Missing orgId parameter' }, { status: 400 });
    }

    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminServer();

    // Verify the user owns this telegram account link
    const { data: tgAccount } = await supabase
      .from('user_telegram_accounts')
      .select('id')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .maybeSingle();

    if (!tgAccount) {
      return NextResponse.json({ error: 'No linked account found' }, { status: 404 });
    }

    // Remove connected groups/channels for this org
    const { error: groupsError } = await supabase
      .from('org_telegram_groups')
      .delete()
      .eq('org_id', orgId);

    if (groupsError) {
      logger.warn({ error: groupsError.message, org_id: orgId }, 'Error removing org groups (continuing)');
    }

    // Remove the telegram account link
    const { error: deleteError } = await supabase
      .from('user_telegram_accounts')
      .delete()
      .eq('user_id', user.id)
      .eq('org_id', orgId);

    if (deleteError) {
      logger.error({ error: deleteError.message, user_id: user.id, org_id: orgId }, 'Error deleting telegram account');
      return NextResponse.json({ error: 'Failed to unlink account' }, { status: 500 });
    }

    logger.info({ user_id: user.id, org_id: orgId }, 'Telegram account unlinked, groups removed');

    return NextResponse.json({ success: true, message: 'Telegram account unlinked' });

  } catch (error: any) {
    logger.error({
      error: error.message || String(error),
      stack: error.stack
    }, 'Error in telegram accounts DELETE');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
