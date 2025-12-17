/**
 * Cron: Error Digest
 * 
 * Sends hourly summary of errors/warnings to Telegram
 * Run every hour via external cron (e.g., cron-job.org)
 * 
 * GET /api/cron/error-digest
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createCronLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function GET(request: NextRequest) {
  const logger = createCronLogger('error-digest');
  
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.CRON_SECRET;
    
    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get errors from last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    const { data: errors, error: dbError } = await supabaseAdmin
      .from('error_logs')
      .select('id, level, message, error_code, context, created_at')
      .gte('created_at', oneHourAgo)
      .in('level', ['error', 'warn'])
      .order('created_at', { ascending: false })
      .limit(50);

    if (dbError) {
      logger.error({ error: dbError }, 'Failed to fetch error logs');
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    // No errors - no notification
    if (!errors || errors.length === 0) {
      logger.info('No errors in the last hour');
      return NextResponse.json({ status: 'ok', message: 'No errors to report' });
    }

    // Group by level
    const errorCount = errors.filter(e => e.level === 'error').length;
    const warnCount = errors.filter(e => e.level === 'warn').length;

    // Build message
    let message = `🚨 *Orbo Error Digest*\n`;
    message += `━━━━━━━━━━━━━━━━━━━━\n`;
    message += `⏰ Последний час\n\n`;
    
    if (errorCount > 0) {
      message += `❌ Ошибок: *${errorCount}*\n`;
    }
    if (warnCount > 0) {
      message += `⚠️ Предупреждений: *${warnCount}*\n`;
    }
    
    message += `\n*Последние ошибки:*\n`;
    
    // Add top 5 errors
    const topErrors = errors.slice(0, 5);
    for (const err of topErrors) {
      const icon = err.level === 'error' ? '❌' : '⚠️';
      const code = err.error_code ? `[${err.error_code}]` : '';
      const shortMessage = err.message?.substring(0, 100) || 'Unknown error';
      message += `\n${icon} ${code} ${shortMessage}`;
      if (err.message && err.message.length > 100) {
        message += '...';
      }
    }
    
    if (errors.length > 5) {
      message += `\n\n_...и ещё ${errors.length - 5} записей_`;
    }
    
    message += `\n\n🔗 [Открыть логи](${process.env.NEXT_PUBLIC_APP_URL}/superadmin/errors)`;

    // Send to Telegram
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    const botToken = process.env.TELEGRAM_NOTIFICATIONS_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
    
    if (!adminChatId || !botToken) {
      logger.warn('TELEGRAM_ADMIN_CHAT_ID or bot token not configured');
      return NextResponse.json({ 
        status: 'ok', 
        message: 'Errors found but Telegram not configured',
        errors: errorCount,
        warnings: warnCount
      });
    }

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: adminChatId,
          text: message,
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        })
      }
    );

    if (!telegramResponse.ok) {
      const error = await telegramResponse.text();
      logger.error({ error }, 'Failed to send Telegram notification');
      return NextResponse.json({ 
        status: 'partial', 
        message: 'Errors found but Telegram send failed',
        errors: errorCount,
        warnings: warnCount
      });
    }

    logger.info({ errors: errorCount, warnings: warnCount }, 'Error digest sent');
    
    return NextResponse.json({ 
      status: 'ok', 
      message: 'Error digest sent to Telegram',
      errors: errorCount,
      warnings: warnCount
    });

  } catch (error) {
    logger.error({ error }, 'Unexpected error in error-digest cron');
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

