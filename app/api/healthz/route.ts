import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Health check endpoint с проверкой webhook'ов
 * 
 * Можно использовать для:
 * 1. Uptime monitoring
 * 2. Проверки конфигурации после деплоя
 * 3. Автоматической диагностики
 */

export async function GET(request: Request) {
  const url = new URL(request.url);
  const checkWebhooks = url.searchParams.get('check_webhooks') === 'true';

  const health: any = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    checks: {
      database: 'ok', // Можно добавить реальную проверку БД
      env_vars: checkEnvVars()
    }
  };

  // Опционально проверяем webhook'и
  if (checkWebhooks) {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get('host') || 'https://my.orbo.ru';
      const webhookCheckUrl = `${baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`}/api/telegram/admin/setup-webhooks`;
      
      const response = await fetch(webhookCheckUrl);
      const data = await response.json();
      
      health.checks.webhooks = {
        status: data.all_configured ? 'configured' : 'needs_setup',
        main_bot: data.webhooks?.main?.configured ? 'ok' : 'not_configured',
        assistant_bot: data.webhooks?.assistant?.configured ? 'ok' : 'not_configured',
        details: data.webhooks
      };

      if (!data.all_configured) {
        health.status = 'degraded';
        health.warnings = [
          'Telegram webhooks are not properly configured',
          `Fix by calling: POST ${webhookCheckUrl}`
        ];
      }
    } catch (error: any) {
      health.checks.webhooks = {
        status: 'error',
        error: error.message
      };
      health.status = 'degraded';
    }
  }

  const statusCode = health.status === 'ok' ? 200 : 503;

  return NextResponse.json(health, { status: statusCode });
}

function checkEnvVars() {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'TELEGRAM_BOT_TOKEN_MAIN',
    'TELEGRAM_BOT_TOKEN_ASSISTANT',
    'TELEGRAM_WEBHOOK_SECRET'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    return {
      status: 'error',
      missing_vars: missing
    };
  }

  return {
    status: 'ok',
    all_present: true
  };
}

