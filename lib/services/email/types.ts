/**
 * Email Provider Abstraction Layer - Types
 * 
 * Интерфейсы для работы с email провайдерами.
 * Поддерживаемые провайдеры: Mailgun, Unisender Go
 */

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  tags?: string[];
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailProvider {
  /**
   * Отправить email
   */
  send(params: SendEmailParams): Promise<SendEmailResult>;

  /**
   * Проверить конфигурацию провайдера
   */
  isConfigured(): boolean;
}

export type EmailProviderType = 'mailgun' | 'unisender' | 'resend' | 'console';

export interface EmailProviderConfig {
  provider: EmailProviderType;
  fromEmail: string;
  fromName?: string;
}

