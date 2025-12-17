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
      console.warn(`[Email] Unknown provider: ${providerType}, using console`);
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
    if (process.env.NODE_ENV === 'production') {
      console.warn('[Email] Provider not configured, email not sent');
    }
    return { success: false, error: 'Email provider not configured' };
  }
  
  return provider.send(params);
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
    <p style="margin: 5px 0;">© 2025 Orbo. Все права защищены.</p>
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
    <p style="margin: 5px 0;">© 2025 Orbo. Все права защищены.</p>
  </div>
</body>
</html>
  `.trim();
}

