/**
 * Email Provider Abstraction Layer - Entry Point
 * 
 * Единый интерфейс для работы с email провайдерами.
 * Переключение между провайдерами через env переменную EMAIL_PROVIDER.
 * 
 * Использование:
 * ```typescript
 * import { createEmailProvider, sendEmail } from '@/lib/services/email';
 * 
 * // Отправка через выбранный провайдер
 * const result = await sendEmail({
 *   to: 'user@example.com',
 *   subject: 'Hello',
 *   html: '<h1>Hello World</h1>',
 * });
 * ```
 * 
 * Поддерживаемые провайдеры:
 * - mailgun (по умолчанию)
 * - unisender
 * - console (для разработки)
 */

import type { EmailProvider, EmailProviderType, SendEmailParams, SendEmailResult } from './types';
import { createMailgunProvider } from './mailgunProvider';
import { createUnisenderGoProvider } from './unisenderGoProvider';
import { createConsoleProvider } from './consoleProvider';
import { createServiceLogger } from '@/lib/logger';

// Re-export types
export type { 
  EmailProvider, 
  EmailProviderType, 
  SendEmailParams, 
  SendEmailResult,
  EmailProviderConfig 
} from './types';

/**
 * Получить текущий провайдер из env
 */
export function getEmailProviderType(): EmailProviderType {
  const provider = process.env.EMAIL_PROVIDER as EmailProviderType;
  
  // По умолчанию - mailgun для обратной совместимости
  if (!provider) return 'mailgun';
  
  return provider;
}

/**
 * Создаёт Email Provider
 */
export function createEmailProvider(): EmailProvider {
  const providerType = getEmailProviderType();
  
  switch (providerType) {
    case 'mailgun':
      return createMailgunProvider();
    
    case 'unisender':
      return createUnisenderGoProvider();
    
    case 'console':
      return createConsoleProvider();
    
    default:
      // Fallback на console для неизвестных провайдеров
      const logger = createServiceLogger('Email');
      logger.warn({ provider_type: providerType }, 'Unknown provider, using console');
      return createConsoleProvider();
  }
}

// Singleton instance
let emailProviderInstance: EmailProvider | null = null;

/**
 * Получить singleton instance Email Provider
 */
export function getEmailProvider(): EmailProvider {
  if (!emailProviderInstance) {
    emailProviderInstance = createEmailProvider();
  }
  return emailProviderInstance;
}

/**
 * Отправить email через текущий провайдер
 * 
 * @example
 * const result = await sendEmail({
 *   to: 'user@example.com',
 *   subject: 'Код подтверждения',
 *   html: '<h1>Ваш код: 123456</h1>',
 * });
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const provider = getEmailProvider();
  
  if (!provider.isConfigured()) {
    // В production логируем предупреждение
    const logger = createServiceLogger('Email');
    if (process.env.NODE_ENV === 'production') {
      logger.warn({ to: params.to }, 'Provider not configured, email not sent');
    }
    return { success: false, error: 'Email provider not configured' };
  }
  
  return provider.send(params);
}

// ============================================
// Уведомления для внутренней команды
// ============================================

/**
 * Уведомить продажи о привязке Telegram к организации
 */
export async function sendSalesNotificationTelegramLinked(data: {
  userName: string
  userEmail: string | null
  telegramUsername: string | null
  telegramUserId: string | number
  orgName: string
  orgId: string
  userId: string
}): Promise<SendEmailResult> {
  const salesEmail = process.env.SALES_NOTIFICATION_EMAIL || 'sales@orbo.ru'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru'

  const tgLink = data.telegramUsername
    ? `<a href="https://t.me/${data.telegramUsername}" style="color:#667eea;">@${data.telegramUsername}</a>`
    : `<span style="color:#6b7280;">ID: ${data.telegramUserId} (без username)</span>`

  const displayName = data.userName || `User ${String(data.userId).slice(0, 8)}`
  const subject = `🔗 Telegram привязан — ${displayName} (${data.orgName})`

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:20px 30px;border-radius:10px 10px 0 0;">
    <h2 style="color:white;margin:0;font-size:18px;">Новый пользователь привязал Telegram</h2>
  </div>
  <div style="background:#fff;padding:30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;">
    <table style="width:100%;border-collapse:collapse;">
      <tr style="border-bottom:1px solid #f3f4f6;"><td style="padding:10px 8px;font-weight:600;color:#6b7280;width:130px;">Имя</td><td style="padding:10px 8px;">${displayName}</td></tr>
      <tr style="border-bottom:1px solid #f3f4f6;"><td style="padding:10px 8px;font-weight:600;color:#6b7280;">Email</td><td style="padding:10px 8px;">${data.userEmail || '—'}</td></tr>
      <tr style="border-bottom:1px solid #f3f4f6;"><td style="padding:10px 8px;font-weight:600;color:#6b7280;">Telegram</td><td style="padding:10px 8px;">${tgLink}</td></tr>
      <tr style="border-bottom:1px solid #f3f4f6;"><td style="padding:10px 8px;font-weight:600;color:#6b7280;">Организация</td><td style="padding:10px 8px;">${data.orgName}</td></tr>
      <tr><td style="padding:10px 8px;font-weight:600;color:#6b7280;">Время</td><td style="padding:10px 8px;">${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} МСК</td></tr>
    </table>
    <div style="margin-top:24px;">
      <a href="${appUrl}/superadmin/users" style="display:inline-block;background:#667eea;color:white;padding:10px 22px;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Открыть в суперадмин</a>
    </div>
  </div>
</body>
</html>`

  return sendEmail({ to: salesEmail, subject, html })
}

/**
 * Переслать сообщение боту в службу поддержки
 */
export async function forwardBotMessage(data: {
  telegramUserId: number
  telegramUsername: string | null
  firstName: string
  text: string
  botName: string
}): Promise<SendEmailResult> {
  const supportEmail = process.env.SUPPORT_EMAIL || process.env.SALES_NOTIFICATION_EMAIL || 'sales@orbo.ru'
  const sender = data.telegramUsername ? `@${data.telegramUsername}` : data.firstName
  const subject = `[Orbo Bot] Сообщение от ${sender} → ${data.botName}`

  const usernameRow = data.telegramUsername
    ? `<tr style="border-bottom:1px solid #f3f4f6;"><td style="padding:8px;font-weight:600;color:#6b7280;">Username</td><td style="padding:8px;"><a href="https://t.me/${data.telegramUsername}" style="color:#667eea;">@${data.telegramUsername}</a></td></tr>`
    : ''
  const replyHint = data.telegramUsername
    ? `Ответить: <a href="https://t.me/${data.telegramUsername}" style="color:#667eea;">@${data.telegramUsername}</a>`
    : `Telegram ID для ответа через бота: <code>${data.telegramUserId}</code>`

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#1e293b;padding:20px 30px;border-radius:10px 10px 0 0;">
    <h2 style="color:white;margin:0;font-size:18px;">Сообщение боту ${data.botName}</h2>
  </div>
  <div style="background:#fff;padding:30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;">
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr style="border-bottom:1px solid #f3f4f6;"><td style="padding:8px;font-weight:600;color:#6b7280;width:120px;">Имя</td><td style="padding:8px;">${data.firstName}</td></tr>
      ${usernameRow}
      <tr><td style="padding:8px;font-weight:600;color:#6b7280;">Telegram ID</td><td style="padding:8px;">${data.telegramUserId}</td></tr>
    </table>
    <div style="background:#f9fafb;border-left:4px solid #667eea;padding:16px;border-radius:4px;">
      <p style="margin:0;white-space:pre-wrap;">${data.text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
    </div>
    <p style="margin-top:20px;font-size:13px;color:#9ca3af;">${replyHint}</p>
  </div>
</body>
</html>`

  return sendEmail({ to: supportEmail, subject, html })
}

// ============================================
// Хелперы для типичных писем
// ============================================

/**
 * Отправить код подтверждения
 */
export async function sendVerificationCode(
  email: string, 
  code: string, 
  userName?: string
): Promise<SendEmailResult> {
  const subject = 'Код подтверждения Orbo';
  const html = getVerificationCodeTemplate(code, userName);
  
  return sendEmail({ to: email, subject, html });
}

/**
 * Отправить приглашение в команду
 */
export async function sendTeamInvitation(
  email: string,
  inviteLink: string,
  orgName: string,
  invitedBy: string
): Promise<SendEmailResult> {
  const subject = `Приглашение в команду ${orgName}`;
  const html = getInvitationTemplate(inviteLink, orgName, invitedBy);
  
  return sendEmail({ to: email, subject, html, tags: ['invitation'] });
}

// ============================================
// Email Templates
// ============================================

function getVerificationCodeTemplate(code: string, userName?: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Код подтверждения</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Orbo</h1>
  </div>
  
  <div style="background: #ffffff; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    ${userName ? `<p style="font-size: 16px; margin-bottom: 20px;">Привет, ${userName}!</p>` : ''}
    
    <p style="font-size: 16px; margin-bottom: 20px;">Ваш код подтверждения:</p>
    
    <div style="background: #f3f4f6; border: 2px solid #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0;">
      <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #667eea; font-family: 'Courier New', monospace;">
        ${code}
      </div>
    </div>
    
    <p style="font-size: 14px; color: #6b7280; margin-bottom: 20px;">
      Код действителен в течение 15 минут.
    </p>
    
    <p style="font-size: 14px; color: #6b7280; margin-bottom: 0;">
      Если вы не запрашивали этот код, просто проигнорируйте это письмо.
    </p>
  </div>
  
  <div style="text-align: center; margin-top: 30px; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 5px 0;">Orbo — CRM участников и событий для Telegram-сообществ</p>
    <p style="margin: 5px 0;"><a href="https://orbo.ru" style="color: #9ca3af;">orbo.ru</a></p>
  </div>
</body>
</html>
  `.trim();
}

function getInvitationTemplate(inviteLink: string, orgName: string, invitedBy: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Приглашение в команду</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Orbo</h1>
  </div>
  
  <div style="background: #ffffff; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    <h2 style="color: #1f2937; margin-top: 0; margin-bottom: 20px;">Приглашение в команду</h2>
    
    <p style="font-size: 16px; margin-bottom: 20px;">
      <strong>${invitedBy}</strong> пригласил вас стать администратором в организации <strong>${orgName}</strong>.
    </p>
    
    <div style="text-align: center; margin: 40px 0;">
      <a href="${inviteLink}" style="display: inline-block; background: #667eea; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
        Принять приглашение
      </a>
    </div>
    
    <p style="font-size: 13px; color: #9ca3af; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
      Ссылка действительна в течение 7 дней.<br>
      <a href="${inviteLink}" style="color: #667eea; word-break: break-all;">${inviteLink}</a>
    </p>
  </div>
  
  <div style="text-align: center; margin-top: 30px; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 5px 0;">Orbo — CRM участников и событий для Telegram-сообществ</p>
    <p style="margin: 5px 0;"><a href="https://orbo.ru" style="color: #9ca3af;">orbo.ru</a></p>
  </div>
</body>
</html>
  `.trim();
}

