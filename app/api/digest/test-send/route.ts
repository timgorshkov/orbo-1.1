/**
 * API: Test Send Weekly Digest
 * 
 * Owner/Admin can trigger test digest send to themselves
 * POST /api/digest/test-send
 * Body: { orgId }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer';
import { generateWeeklyDigest } from '@/lib/services/weeklyDigestService';
import { formatDigestForTelegram } from '@/lib/templates/weeklyDigest';
import { sendDigestDM } from '@/lib/services/telegramNotificationService';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClientServer();
    const adminSupabase = createAdminServer();
    const body = await request.json();
    const { orgId } = body;

    if (!orgId) {
      return NextResponse.json({ error: 'orgId required' }, { status: 400 });
    }

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permissions (owner/admin only)
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden: owner/admin only' }, { status: 403 });
    }

    // Get user's tg_user_id using admin client to bypass RLS
    const { data: participant } = await adminSupabase
      .from('participants')
      .select('tg_user_id')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();

    if (!participant?.tg_user_id) {
      return NextResponse.json({
        error: 'No Telegram account linked',
        message: 'Вы должны связать Telegram аккаунт, чтобы получать дайджесты.'
      }, { status: 400 });
    }

    // Check if bot token is configured
    if (!process.env.TELEGRAM_NOTIFICATIONS_BOT_TOKEN) {
      return NextResponse.json({
        error: 'Bot not configured',
        message: 'TELEGRAM_NOTIFICATIONS_BOT_TOKEN не настроен на сервере.'
      }, { status: 500 });
    }

    // Generate digest
    const startTime = Date.now();
    const digest = await generateWeeklyDigest(orgId, user.id);
    const digestText = formatDigestForTelegram(digest);

    // Send via Telegram
    const sendResult = await sendDigestDM(participant.tg_user_id, digestText);

    if (!sendResult.success) {
      return NextResponse.json({
        error: 'Failed to send',
        message: sendResult.error || 'Не удалось отправить сообщение в Telegram',
        hint: sendResult.error?.includes('not started')
          ? 'Запустите бота уведомлений Orbo в Telegram (отправьте /start)'
          : undefined
      }, { status: 500 });
    }

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      messageId: sendResult.messageId,
      cost: {
        usd: digest.cost.totalUsd,
        rub: digest.cost.totalRub
      },
      stats: {
        messages: digest.keyMetrics.current.messages,
        participants: digest.keyMetrics.current.active_participants,
        topContributors: digest.topContributors.length,
        events: digest.upcomingEvents.length
      },
      durationMs: duration
    });

  } catch (error) {
    console.error('[API] Test digest send error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

