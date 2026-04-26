import { NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';
import { getEffectiveOrgRole } from '@/lib/server/orgAccess';
import { createMaxService } from '@/lib/services/maxService';

export const dynamic = 'force-dynamic';

// GET - get current MAX account for org
export async function GET(request: Request) {
  const logger = createAPILogger(request, { endpoint: '/api/max/accounts' });
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

    const orgRole = await getEffectiveOrgRole(user.id, orgId);
    if (!orgRole) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createAdminServer();

    const { data: maxAccount, error } = await supabase
      .from('user_max_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error({ error: error.message }, 'Error fetching MAX account');
      return NextResponse.json({ error: 'Failed to fetch MAX account' }, { status: 500 });
    }

    return NextResponse.json({ maxAccount: maxAccount || null });
  } catch (error: any) {
    logger.error({ error: error.message }, 'GET /api/max/accounts error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - register MAX user ID and send verification code
export async function POST(request: Request) {
  const logger = createAPILogger(request, { endpoint: '/api/max/accounts' });
  try {
    const body = await request.json();
    const { orgId, maxUserId } = body;

    if (!orgId || !maxUserId) {
      return NextResponse.json({ error: 'Missing orgId or maxUserId' }, { status: 400 });
    }

    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orgRole = await getEffectiveOrgRole(user.id, orgId);
    if (!orgRole) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createAdminServer();

    // Try to fetch user info from MAX API
    let maxUsername: string | null = null;
    let maxFirstName: string | null = null;
    let maxLastName: string | null = null;

    try {
      const maxService = createMaxService('main');
      // MAX API doesn't expose a getUser endpoint publicly yet; skip gracefully
      logger.debug({ max_user_id: maxUserId }, 'MAX user info fetch skipped - API limitation');
    } catch {
      logger.debug('MAX service init failed - continuing without user info');
    }

    // Generate verification code
    const verificationCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    // Upsert account record
    const { data: maxAccount, error: upsertErr } = await supabase
      .from('user_max_accounts')
      .upsert({
        user_id: user.id,
        org_id: orgId,
        max_user_id: maxUserId,
        max_username: maxUsername,
        max_first_name: maxFirstName,
        max_last_name: maxLastName,
        is_verified: false,
        verification_code: verificationCode,
        verification_expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,org_id' })
      .select()
      .single();

    if (upsertErr) {
      logger.error({ error: upsertErr.message }, 'Error upserting MAX account');
      return NextResponse.json({ error: 'Failed to save MAX account' }, { status: 500 });
    }

    // Send verification code via MAX bot.
    // Try main bot first — user has already opened a dialog with it via /start.
    // Fall back to notifications bot if main fails (e.g. not configured).
    const maxBotUsername = process.env.MAX_MAIN_BOT_USERNAME || process.env.MAX_NOTIFICATIONS_BOT_USERNAME;

    const verificationMessage =
      `🔐 Код верификации Orbo\n\n` +
      `Для подтверждения вашего MAX-аккаунта введите код:\n\n` +
      `<b>${verificationCode}</b>\n\n` +
      `⏰ Код действителен 15 минут\n` +
      `🔒 Если вы не запрашивали код — проигнорируйте`;

    // Notifications bot is the primary DM channel (user opens dialog via /start there).
    // Fall back to main bot if notifications bot is not configured.
    const botsToTry = (['notifications', 'main'] as const).filter(botType => {
      const envKey = botType === 'notifications' ? 'MAX_NOTIFICATIONS_BOT_TOKEN' : 'MAX_MAIN_BOT_TOKEN';
      return !!process.env[envKey];
    });

    let codeSent = false;
    for (const botType of botsToTry) {
      try {
        const svc = createMaxService(botType);
        const result = await svc.sendMessageToUser(Number(maxUserId), verificationMessage, { format: 'html' });
        if (result.ok) {
          codeSent = true;
          break;
        }
        logger.warn({ max_user_id: maxUserId, bot_type: botType, error: result.error }, 'Failed to send MAX verification code, trying next bot');
      } catch {
        // try next bot
      }
    }

    if (!codeSent) {
      logger.warn({ max_user_id: maxUserId }, 'Could not send MAX verification code via any bot');
      return NextResponse.json({
        error: 'Не удалось отправить код. Убедитесь, что вы начали диалог с ботом в MAX.',
        code: 'BOT_BLOCKED',
        maxAccount: { ...maxAccount, verification_code: undefined },
      }, { status: 400 });
    }

    logger.info({ user_id: user.id, org_id: orgId, max_user_id: maxUserId }, 'MAX verification code sent');

    return NextResponse.json({
      maxAccount: { ...maxAccount, verification_code: undefined },
      message: `Код верификации отправлен в MAX. Проверьте диалог с ботом${maxBotUsername ? ` @${maxBotUsername}` : ''}.`,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'POST /api/max/accounts error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - verify code
export async function PUT(request: Request) {
  const logger = createAPILogger(request, { endpoint: '/api/max/accounts' });
  try {
    const body = await request.json();
    const { orgId, verificationCode } = body;

    if (!orgId || !verificationCode) {
      return NextResponse.json({ error: 'Missing orgId or verificationCode' }, { status: 400 });
    }

    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orgRole = await getEffectiveOrgRole(user.id, orgId);
    if (!orgRole) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createAdminServer();

    const { data: account, error: findErr } = await supabase
      .from('user_max_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .eq('verification_code', verificationCode.toUpperCase())
      .gt('verification_expires_at', new Date().toISOString())
      .single();

    if (findErr || !account) {
      return NextResponse.json({ error: 'Неверный или просроченный код верификации' }, { status: 400 });
    }

    const { data: verified, error: updateErr } = await supabase
      .from('user_max_accounts')
      .update({
        is_verified: true,
        verified_at: new Date().toISOString(),
        verification_code: null,
        verification_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', account.id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: 'Failed to verify account' }, { status: 500 });
    }

    logger.info({ user_id: user.id, org_id: orgId, max_user_id: account.max_user_id }, 'MAX account verified');

    return NextResponse.json({
      maxAccount: verified,
      message: 'MAX-аккаунт успешно подтверждён!',
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'PUT /api/max/accounts error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - unlink MAX account
export async function DELETE(request: Request) {
  const logger = createAPILogger(request, { endpoint: '/api/max/accounts' });
  try {
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('orgId');

    if (!orgId) {
      return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
    }

    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orgRole = await getEffectiveOrgRole(user.id, orgId);
    if (!orgRole) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createAdminServer();

    const { error } = await supabase
      .from('user_max_accounts')
      .delete()
      .eq('user_id', user.id)
      .eq('org_id', orgId);

    if (error) {
      return NextResponse.json({ error: 'Failed to unlink MAX account' }, { status: 500 });
    }

    logger.info({ user_id: user.id, org_id: orgId }, 'MAX account unlinked');

    return NextResponse.json({ message: 'MAX-аккаунт отвязан' });
  } catch (error: any) {
    logger.error({ error: error.message }, 'DELETE /api/max/accounts error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
