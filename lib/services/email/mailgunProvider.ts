/**
 * Mailgun Email Provider
 * 
 * Реализация отправки email через Mailgun API.
 */

import type { EmailProvider, SendEmailParams, SendEmailResult } from './types';
import { createServiceLogger } from '@/lib/logger';

const logger = createServiceLogger('MailgunEmail');

// Lazy load mailgun.js to avoid build issues
let mailgunClient: any = null;

async function getMailgunClient() {
  if (mailgunClient) return mailgunClient;
  
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  
  if (!apiKey || !domain) return null;
  
  const formData = (await import('form-data')).default;
  const Mailgun = (await import('mailgun.js')).default;
  
  const mg = new Mailgun(formData);
  mailgunClient = mg.client({ username: 'api', key: apiKey });
  
  return mailgunClient;
}

export class MailgunEmailProvider implements EmailProvider {
  private domain: string;
  private fromEmail: string;

  constructor() {
    this.domain = process.env.MAILGUN_DOMAIN || '';
    this.fromEmail = process.env.MAILGUN_FROM_EMAIL || 'noreply@orbo.ru';
  }

  isConfigured(): boolean {
    return !!(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN);
  }

  async send(params: SendEmailParams): Promise<SendEmailResult> {
    if (!this.isConfigured()) {
      logger.warn({ to: params.to }, 'Mailgun not configured, skipping email');
      return { success: false, error: 'Mailgun not configured' };
    }

    try {
      const client = await getMailgunClient();
      if (!client) {
        return { success: false, error: 'Failed to initialize Mailgun client' };
      }

      const result = await client.messages.create(this.domain, {
        from: this.fromEmail,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text || this.stripHtml(params.html),
      });

      logger.info({ 
        to: params.to, 
        message_id: result.id 
      }, 'Email sent via Mailgun');
      
      return { 
        success: true, 
        messageId: result.id 
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ 
        to: params.to, 
        error: errorMessage 
      }, 'Mailgun send failed');
      
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
 * Создаёт Mailgun Email Provider
 */
export function createMailgunProvider(): MailgunEmailProvider {
  return new MailgunEmailProvider();
}

