/**
 * Unisender Go Email Provider
 * 
 * Реализация отправки email через Unisender Go API.
 * Документация: https://godocs.unisender.ru/
 */

import type { EmailProvider, SendEmailParams, SendEmailResult } from './types';
import { createServiceLogger } from '@/lib/logger';

const logger = createServiceLogger('UnisenderGoEmail');

export class UnisenderGoEmailProvider implements EmailProvider {
  private apiKey: string;
  private fromEmail: string;
  private fromName: string;
  // URL зависит от региона аккаунта (go1 или go2)
  // Можно переопределить через UNISENDER_API_URL
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.UNISENDER_API_KEY || '';
    this.fromEmail = process.env.UNISENDER_FROM_EMAIL || 'noreply@orbo.ru';
    this.fromName = process.env.UNISENDER_FROM_NAME || 'Orbo';
    // По умолчанию go2 (более новый), можно переопределить через env
    this.baseUrl = process.env.UNISENDER_API_URL || 'https://go2.unisender.ru/ru/transactional/api/v1';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async send(params: SendEmailParams): Promise<SendEmailResult> {
    if (!this.isConfigured()) {
      logger.warn({ to: params.to }, 'Unisender Go not configured, skipping email');
      return { success: false, error: 'Unisender Go not configured' };
    }


    try {
      const response = await fetch(`${this.baseUrl}/email/send.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': this.apiKey,
        },
        body: JSON.stringify({
          message: {
            recipients: [{ email: params.to }],
            subject: params.subject,
            body: {
              html: params.html,
              plaintext: params.text || this.stripHtml(params.html),
            },
            from_email: this.fromEmail,
            from_name: this.fromName,
            reply_to: params.replyTo,
            track_links: 0,
            track_read: 0,
            // Теги для аналитики
            ...(params.tags && { tags: params.tags }),
          },
        }),
      });

      const result = await response.json();

      if (result.status === 'success') {
        logger.info({ 
          to: params.to, 
          job_id: result.job_id 
        }, 'Email sent via Unisender Go');
        
        return { 
          success: true, 
          messageId: result.job_id 
        };
      } else {
        logger.error({ 
          to: params.to, 
          error: result.message || 'Unknown error',
          code: result.code 
        }, 'Unisender Go send failed');
        
        return { 
          success: false, 
          error: result.message || 'Send failed' 
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ 
        to: params.to, 
        error: errorMessage 
      }, 'Unisender Go request failed');
      
      return { success: false, error: errorMessage };
    }
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }
}

/**
 * Создаёт Unisender Go Email Provider
 */
export function createUnisenderGoProvider(): UnisenderGoEmailProvider {
  return new UnisenderGoEmailProvider();
}

