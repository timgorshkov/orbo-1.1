import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { logErrorToDatabase } from '@/lib/logErrorToDatabase';
import { createMaxService } from '@/lib/services/maxService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/max/webhook
 * Webhook for MAX Main Bot.
 * Handles: message_created, bot_added, bot_removed, user_added, user_removed, message_callback
 */
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/max/webhook', botType: 'max-main' });
  logger.debug('MAX webhook received');

  // Verify webhook secret
  const expectedSecret = process.env.MAX_WEBHOOK_SECRET;
  const receivedSecret = request.headers.get('x-max-bot-api-secret');

  if (expectedSecret && receivedSecret !== expectedSecret) {
    logger.warn({ received: !!receivedSecret }, 'Unauthorized - secret mismatch');
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const body = await request.json();
    const updateType = body.update_type;

    logger.debug({
      update_type: updateType,
      timestamp: body.timestamp,
      chat_id: body.chat_id || body.message?.recipient?.chat_id,
      user_id: body.user?.user_id || body.message?.sender?.user_id,
    }, '📨 [MAX-WEBHOOK] Received update');

    // Fire-and-forget processing, respond immediately
    processMaxUpdate(body, logger).catch((error) => {
      logger.error({
        update_type: updateType,
        error: error instanceof Error ? error.message : String(error),
      }, 'MAX webhook background processing failed');
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error parsing MAX webhook');
    return NextResponse.json({ ok: true });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    bot: 'max-main',
    description: 'MAX Main Bot Webhook',
  });
}

// ─── Background processing ─────────────────────────────────

async function processMaxUpdate(body: any, logger: any) {
  const supabase = createAdminServer();
  const updateType = body.update_type;

  // Idempotency check
  const updateId = body.timestamp ? `${updateType}-${body.timestamp}` : null;
  if (updateId) {
    const { data: existing } = await supabase
      .from('max_webhook_idempotency')
      .select('update_id')
      .eq('update_id', updateId)
      .maybeSingle();

    if (existing) {
      logger.debug({ update_id: updateId }, 'Duplicate MAX webhook, skipping');
      return;
    }

    await supabase.from('max_webhook_idempotency').insert({
      update_id: updateId,
      max_chat_id: body.chat_id || body.message?.recipient?.chat_id || null,
      event_type: updateType,
    }).then(() => {});
  }

  switch (updateType) {
    case 'message_created':
      await handleMessageCreated(body, supabase, logger);
      break;
    case 'bot_added':
      await handleBotAdded(body, supabase, logger);
      break;
    case 'bot_removed':
      await handleBotRemoved(body, supabase, logger);
      break;
    case 'user_added':
      await handleUserAdded(body, supabase, logger);
      break;
    case 'user_removed':
      await handleUserRemoved(body, supabase, logger);
      break;
    case 'message_callback':
      await handleMessageCallback(body, supabase, logger);
      break;
    default:
      logger.debug({ update_type: updateType }, 'Unhandled MAX update type');
  }
}

// ─── message_created ────────────────────────────────────────

async function handleMessageCreated(body: any, supabase: any, logger: any) {
  const message = body.message;
  if (!message) return;

  const chatId = message.recipient?.chat_id;
  const sender = message.sender;
  if (!chatId || !sender) return;

  const maxUserId = sender.user_id;
  const userName = sender.name || 'Unknown';
  const username = sender.username || null;

  // Handle /start or /id commands in DM (for account verification)
  const messageText: string = message.body?.text?.trim() || '';
  const isPrivateMessage = !message.recipient?.chat_id || message.recipient.chat_type === 'dialog';

  // Save dialog_chat_id for future DM sends (MAX API requires chat_id, not user_id)
  if (isPrivateMessage && chatId) {
    await supabase
      .from('max_user_dialogs')
      .upsert({ max_user_id: maxUserId, dialog_chat_id: chatId, updated_at: new Date().toISOString() }, { onConflict: 'max_user_id' })
      .then(() => {});
  }

  if (isPrivateMessage && (messageText === '/start' || messageText === '/id' || messageText.startsWith('/start '))) {
    try {
      const maxService = createMaxService('main');

      // Check if there's a pending verification code for this user
      const { data: pendingAccount } = await supabase
        .from('user_max_accounts')
        .select('verification_code, verification_expires_at')
        .eq('max_user_id', maxUserId)
        .eq('is_verified', false)
        .gt('verification_expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let replyText: string;
      if (pendingAccount?.verification_code) {
        replyText =
          `👋 Привет от Orbo!\n\n` +
          `Ваш MAX User ID: <b>${maxUserId}</b>\n\n` +
          `🔐 Ваш код верификации:\n<b>${pendingAccount.verification_code}</b>\n\n` +
          `⏰ Код действителен 15 минут\n` +
          `Введите его на странице настроек Orbo.`;
      } else {
        replyText =
          `👋 Привет от Orbo!\n\n` +
          `Ваш MAX User ID: <b>${maxUserId}</b>\n\n` +
          `Используйте этот ID на странице настроек Orbo для привязки аккаунта.\n` +
          `Код верификации будет отправлен после ввода ID на сайте.`;
      }

      await maxService.sendMessageToUser(maxUserId, replyText, { format: 'html' });
      logger.info({ max_user_id: maxUserId }, '✅ MAX /start: sent user ID and verification info');
    } catch (e: any) {
      logger.warn({ max_user_id: maxUserId, error: e.message }, 'Failed to send /start reply');
    }
    return;
  }

  // Find which org this chat belongs to
  const { data: orgGroup } = await supabase
    .from('org_max_groups')
    .select('org_id')
    .eq('max_chat_id', chatId)
    .eq('status', 'active')
    .maybeSingle();

  if (!orgGroup) {
    logger.debug({ max_chat_id: chatId }, 'Message from unlinked MAX chat');
    return;
  }

  const orgId = orgGroup.org_id;

  // Upsert participant by max_user_id
  const { data: existingParticipant } = await supabase
    .from('participants')
    .select('id')
    .eq('org_id', orgId)
    .eq('max_user_id', maxUserId)
    .is('merged_into', null)
    .maybeSingle();

  let participantId: string;

  if (existingParticipant) {
    participantId = existingParticipant.id;
    // Update name/username if changed
    await supabase
      .from('participants')
      .update({
        full_name: userName,
        max_username: username,
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', participantId);
  } else {
    const { data: newP, error: insertErr } = await supabase
      .from('participants')
      .insert({
        org_id: orgId,
        max_user_id: maxUserId,
        full_name: userName,
        max_username: username,
        source: 'max_group',
        participant_status: 'participant',
        last_activity_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (insertErr) {
      if (insertErr.code === '23505') {
        const { data: raceP } = await supabase
          .from('participants')
          .select('id')
          .eq('org_id', orgId)
          .eq('max_user_id', maxUserId)
          .is('merged_into', null)
          .maybeSingle();
        if (!raceP) return;
        participantId = raceP.id;
      } else {
        logger.error({ error: insertErr.message }, 'Failed to insert MAX participant');
        return;
      }
    } else {
      participantId = newP.id;
    }
  }

  // Record activity event
  await supabase.from('activity_events').insert({
    org_id: orgId,
    event_type: 'message',
    max_chat_id: chatId,
    max_user_id: maxUserId,
    messenger_type: 'max',
    meta: {
      message_id: message.body?.mid,
      text_length: message.body?.text?.length || 0,
    },
  }).then(() => {});

  logger.debug({
    org_id: orgId,
    participant_id: participantId,
    max_chat_id: chatId,
    max_user_id: maxUserId,
  }, '✅ MAX message processed');
}

// ─── bot_added ──────────────────────────────────────────────

async function handleBotAdded(body: any, supabase: any, logger: any) {
  const chatId = body.chat_id;
  if (!chatId) return;

  // Fetch chat info from API
  let chatTitle = body.chat?.title || `MAX Group ${chatId}`;
  let chatDescription = body.chat?.description || null;

  try {
    const maxService = createMaxService('main');
    const chatResult = await maxService.getChat(chatId);
    if (chatResult.ok && chatResult.data) {
      chatTitle = chatResult.data.title || chatTitle;
      chatDescription = chatResult.data.description || chatDescription;
    }
  } catch {
    // Proceed with body data
  }

  const { error } = await supabase
    .from('max_groups')
    .upsert({
      max_chat_id: chatId,
      title: chatTitle,
      description: chatDescription,
      bot_status: 'connected',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'max_chat_id' });

  if (error) {
    logger.error({ error: error.message, max_chat_id: chatId }, 'Failed to upsert max_group on bot_added');
  } else {
    logger.info({ max_chat_id: chatId, title: chatTitle }, '✅ MAX bot added to group');
  }
}

// ─── bot_removed ────────────────────────────────────────────

async function handleBotRemoved(body: any, supabase: any, logger: any) {
  const chatId = body.chat_id;
  if (!chatId) return;

  await supabase
    .from('max_groups')
    .update({ bot_status: 'inactive', updated_at: new Date().toISOString() })
    .eq('max_chat_id', chatId);

  logger.info({ max_chat_id: chatId }, '🔴 MAX bot removed from group');
}

// ─── user_added ─────────────────────────────────────────────

async function handleUserAdded(body: any, supabase: any, logger: any) {
  const chatId = body.chat_id;
  const user = body.user;
  if (!chatId || !user) return;

  const maxUserId = user.user_id;
  const userName = user.name || 'Unknown';
  const username = user.username || null;

  const { data: orgGroup } = await supabase
    .from('org_max_groups')
    .select('org_id')
    .eq('max_chat_id', chatId)
    .eq('status', 'active')
    .maybeSingle();

  if (!orgGroup) return;
  const orgId = orgGroup.org_id;

  // Upsert participant
  const { data: existingP } = await supabase
    .from('participants')
    .select('id')
    .eq('org_id', orgId)
    .eq('max_user_id', maxUserId)
    .is('merged_into', null)
    .maybeSingle();

  let participantId: string;

  if (existingP) {
    participantId = existingP.id;
    await supabase.from('participants')
      .update({ full_name: userName, max_username: username, last_activity_at: new Date().toISOString() })
      .eq('id', participantId);
  } else {
    const { data: newP, error: err } = await supabase.from('participants').insert({
      org_id: orgId,
      max_user_id: maxUserId,
      full_name: userName,
      max_username: username,
      source: 'max_group',
      participant_status: 'participant',
      last_activity_at: new Date().toISOString(),
    }).select('id').single();

    if (err) {
      if (err.code === '23505') {
        const { data: rp } = await supabase.from('participants').select('id')
          .eq('org_id', orgId).eq('max_user_id', maxUserId).is('merged_into', null).maybeSingle();
        if (!rp) return;
        participantId = rp.id;
      } else { return; }
    } else {
      participantId = newP.id;
    }
  }

  // Record join event
  await supabase.from('activity_events').insert({
    org_id: orgId,
    event_type: 'join',
    max_chat_id: chatId,
    max_user_id: maxUserId,
    messenger_type: 'max',
  }).then(() => {});

  // Check if there's an application pipeline linked to this MAX group
  try {
    const { data: pipeline } = await supabase
      .from('application_pipelines')
      .select('id, org_id')
      .eq('max_group_id', chatId)
      .eq('pipeline_type', 'join_request')
      .eq('is_active', true)
      .maybeSingle();

    if (pipeline) {
      // Check for existing application
      const { data: existingApp } = await supabase
        .from('applications')
        .select('id')
        .eq('max_chat_id', chatId)
        .eq('max_user_id', maxUserId)
        .maybeSingle();

      if (!existingApp) {
        // Get first form for this pipeline
        const { data: form } = await supabase
          .from('application_forms')
          .select('id')
          .eq('pipeline_id', pipeline.id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        let formId = form?.id || null;

        if (!formId) {
          // Auto-create default form
          const { data: newForm } = await supabase
            .from('application_forms')
            .insert({
              org_id: pipeline.org_id,
              pipeline_id: pipeline.id,
              name: 'Заявка (авто)',
              form_schema: [],
              landing: {},
              success_page: {},
              settings: {},
              is_active: true,
            })
            .select('id')
            .single();

          if (newForm) formId = newForm.id;
        }

        if (formId) {
          const tgUserData = {
            first_name: userName,
            username: username,
          };

          await supabase.rpc('create_application', {
            p_org_id: pipeline.org_id,
            p_form_id: formId,
            p_tg_user_id: null,
            p_tg_chat_id: null,
            p_tg_user_data: tgUserData,
            p_form_data: {},
            p_source_code: null,
            p_utm_data: { source: 'max_group_join' },
          });

          logger.info({
            org_id: orgId,
            pipeline_id: pipeline.id,
            max_user_id: maxUserId,
            max_chat_id: chatId,
          }, '✅ Auto-application created for MAX user join');
        }
      }
    }
  } catch (pipelineErr: any) {
    logger.warn({ error: pipelineErr.message, max_user_id: maxUserId, max_chat_id: chatId },
      'Failed to process application pipeline for MAX user join');
  }

  logger.info({ org_id: orgId, max_user_id: maxUserId, max_chat_id: chatId }, '✅ MAX user added');
}

// ─── user_removed ───────────────────────────────────────────

async function handleUserRemoved(body: any, supabase: any, logger: any) {
  const chatId = body.chat_id;
  const user = body.user;
  if (!chatId || !user) return;

  const maxUserId = user.user_id;

  const { data: orgGroup } = await supabase
    .from('org_max_groups')
    .select('org_id')
    .eq('max_chat_id', chatId)
    .eq('status', 'active')
    .maybeSingle();

  if (!orgGroup) return;
  const orgId = orgGroup.org_id;

  const { data: participant } = await supabase
    .from('participants')
    .select('id')
    .eq('org_id', orgId)
    .eq('max_user_id', maxUserId)
    .is('merged_into', null)
    .maybeSingle();

  if (!participant) return;

  // Record leave event
  await supabase.from('activity_events').insert({
    org_id: orgId,
    event_type: 'leave',
    max_chat_id: chatId,
    max_user_id: maxUserId,
    messenger_type: 'max',
  }).then(() => {});

  logger.info({ org_id: orgId, max_user_id: maxUserId, max_chat_id: chatId }, '🔴 MAX user removed');
}

// ─── message_callback ───────────────────────────────────────

async function handleMessageCallback(body: any, supabase: any, logger: any) {
  const callback = body.callback;
  if (!callback) return;

  logger.debug({
    payload: callback.payload,
    user_id: callback.user?.user_id,
  }, 'MAX callback received');

  // Future: handle inline keyboard callbacks (e.g., approve/reject applications)
}
