import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createServiceLogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';
import { getEmailService } from '@/lib/services/emailService';

const logger = createServiceLogger('WelcomeRecovery');

export const dynamic = 'force-dynamic';

async function verifySuperadmin() {
  const user = await getUnifiedUser();
  if (!user) return { authorized: false, error: 'Unauthorized' };

  const db = createAdminServer();
  const { data: sa } = await db.from('superadmins').select('id').eq('user_id', user.id).single();
  if (!sa) return { authorized: false, error: 'Forbidden' };

  return { authorized: true, userId: user.id };
}

// Bug introduced in deploy ~16:29 MSK = 13:29 UTC on 2026-04-03
const BUG_DEPLOY_CUTOFF = '2026-04-03T13:29:00.000Z';

function buildRecoveryEmailHtml(userName?: string | null): string {
  const name = userName || 'пользователь';
  const welcomeUrl = 'https://my.orbo.ru/welcome';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Завершите настройку Orbo</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Orbo</h1>
  </div>

  <div style="background: #ffffff; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px; margin-bottom: 20px;">Привет, ${name}!</p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Мы заметили, что при регистрации у вас возникла техническая проблема — страница не загрузилась до конца из-за ошибки на нашей стороне.
    </p>

    <p style="font-size: 16px; margin-bottom: 30px;">
      Мы уже исправили эту проблему. Нажмите кнопку ниже, чтобы продолжить и создать своё первое пространство в Orbo.
    </p>

    <div style="text-align: center; margin: 40px 0;">
      <a href="${welcomeUrl}" style="display: inline-block; background: #667eea; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
        Продолжить регистрацию
      </a>
    </div>

    <p style="font-size: 14px; color: #6b7280;">
      Если кнопка не работает, перейдите по ссылке: <a href="${welcomeUrl}" style="color: #667eea;">${welcomeUrl}</a>
    </p>
  </div>

  <div style="text-align: center; margin-top: 30px; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 5px 0;">© 2026 Orbo. Все права защищены.</p>
    <p style="margin: 5px 0;">Платформа для управления сообществами</p>
  </div>
</body>
</html>
`.trim();
}

// GET — preview affected users without sending
export async function GET(request: NextRequest) {
  const { authorized, error } = await verifySuperadmin();
  if (!authorized) return NextResponse.json({ error }, { status: 401 });

  const db = createAdminServer();
  const { data, error: dbError } = await db.raw<{ id: string; email: string; name: string | null; created_at: string }[]>(
    `SELECT u.id, u.email, u.name, u.created_at
     FROM users u
     LEFT JOIN memberships m ON m.user_id = u.id
     WHERE u.created_at >= $1
       AND u.email IS NOT NULL
       AND (u.is_shadow_profile IS NULL OR u.is_shadow_profile = false)
       AND m.id IS NULL
     ORDER BY u.created_at DESC`,
    [BUG_DEPLOY_CUTOFF]
  );

  if (dbError) {
    return NextResponse.json({ error: String(dbError) }, { status: 500 });
  }

  return NextResponse.json({
    cutoff: BUG_DEPLOY_CUTOFF,
    count: (data || []).length,
    users: (data || []).map(u => ({ id: u.id, email: u.email, name: u.name, created_at: u.created_at })),
  });
}

// POST — send recovery emails (dry_run=true to preview only)
export async function POST(request: NextRequest) {
  const { authorized, error } = await verifySuperadmin();
  if (!authorized) return NextResponse.json({ error }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const dryRun: boolean = body.dry_run !== false; // safe default: dry run

  const db = createAdminServer();
  const { data, error: dbError } = await db.raw<{ id: string; email: string; name: string | null; created_at: string }[]>(
    `SELECT u.id, u.email, u.name, u.created_at
     FROM users u
     LEFT JOIN memberships m ON m.user_id = u.id
     WHERE u.created_at >= $1
       AND u.email IS NOT NULL
       AND (u.is_shadow_profile IS NULL OR u.is_shadow_profile = false)
       AND m.id IS NULL
     ORDER BY u.created_at DESC`,
    [BUG_DEPLOY_CUTOFF]
  );

  if (dbError) {
    return NextResponse.json({ error: String(dbError) }, { status: 500 });
  }

  const users = data || [];

  if (dryRun) {
    return NextResponse.json({
      dry_run: true,
      cutoff: BUG_DEPLOY_CUTOFF,
      would_send_to: users.map(u => ({ id: u.id, email: u.email, name: u.name, created_at: u.created_at })),
    });
  }

  const results: { email: string; success: boolean }[] = [];

  for (const user of users) {
    const html = buildRecoveryEmailHtml(user.name);
    const success = await getEmailService().sendEmail({
      to: user.email,
      subject: 'Завершите настройку вашего пространства в Orbo',
      html,
    });

    results.push({ email: user.email, success });

    logger.info(
      { userId: user.id, email: user.email, success },
      success ? 'Recovery email sent' : 'Recovery email failed'
    );
  }

  const sent = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  logger.info({ sent, failed, total: users.length }, 'Welcome recovery emails done');

  return NextResponse.json({ dry_run: false, total: users.length, sent, failed, results });
}
