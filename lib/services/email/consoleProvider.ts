/**
 * Console Email Provider
 * 
 * Провайдер для разработки — выводит письма в консоль.
 */

import type { EmailProvider, SendEmailParams, SendEmailResult } from './types';
import { createServiceLogger } from '@/lib/logger';

const logger = createServiceLogger('ConsoleEmail');

export class ConsoleEmailProvider implements EmailProvider {
  isConfigured(): boolean {
    return true;
  }

  async send(params: SendEmailParams): Promise<SendEmailResult> {
    logger.info({
      to: params.to,
      subject: params.subject,
      html_length: params.html.length,
      text_preview: (params.text || params.html).substring(0, 200),
    }, '[DEV] Email would be sent');

    // В development выводим содержимое письма
    if (process.env.NODE_ENV === 'development') {
      console.log('\n📧 ===== EMAIL (Console Provider) =====');
      console.log(`To: ${params.to}`);
      console.log(`Subject: ${params.subject}`);
      console.log(`---`);
      console.log(params.text || params.html.replace(/<[^>]*>/g, ''));
      console.log('========================================\n');
    }

    return { 
      success: true, 
      messageId: `console-${Date.now()}` 
    };
  }
}

/**
 * Создаёт Console Email Provider
 */
export function createConsoleProvider(): ConsoleEmailProvider {
  return new ConsoleEmailProvider();
}

