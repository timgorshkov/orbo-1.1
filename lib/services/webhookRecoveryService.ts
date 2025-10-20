/**
 * Webhook Recovery Service
 * Автоматически восстанавливает webhook при обнаружении проблем
 */

import { TelegramService } from './telegramService';

interface RecoveryAttempt {
  timestamp: number;
  botType: 'main' | 'notifications';
  success: boolean;
  error?: string;
}

class WebhookRecoveryService {
  private static instance: WebhookRecoveryService;
  private recoveryAttempts: Map<string, RecoveryAttempt[]> = new Map();
  private readonly MAX_ATTEMPTS_PER_HOUR = 3; // Не более 3 попыток в час
  private readonly COOLDOWN_MS = 20 * 60 * 1000; // 20 минут между попытками

  private constructor() {}

  static getInstance(): WebhookRecoveryService {
    if (!WebhookRecoveryService.instance) {
      WebhookRecoveryService.instance = new WebhookRecoveryService();
    }
    return WebhookRecoveryService.instance;
  }

  /**
   * Проверяет, можно ли попытаться восстановить webhook
   */
  private canAttemptRecovery(botType: 'main' | 'notifications'): boolean {
    const attempts = this.recoveryAttempts.get(botType) || [];
    const now = Date.now();
    
    // Удаляем старые попытки (старше 1 часа)
    const recentAttempts = attempts.filter(a => now - a.timestamp < 60 * 60 * 1000);
    this.recoveryAttempts.set(botType, recentAttempts);
    
    // Проверяем количество попыток
    if (recentAttempts.length >= this.MAX_ATTEMPTS_PER_HOUR) {
      console.warn(`[Webhook Recovery] Too many recovery attempts for ${botType} bot (${recentAttempts.length}/${this.MAX_ATTEMPTS_PER_HOUR})`);
      return false;
    }
    
    // Проверяем cooldown
    const lastAttempt = recentAttempts[recentAttempts.length - 1];
    if (lastAttempt && now - lastAttempt.timestamp < this.COOLDOWN_MS) {
      const waitMinutes = Math.ceil((this.COOLDOWN_MS - (now - lastAttempt.timestamp)) / 60000);
      console.warn(`[Webhook Recovery] Cooldown active for ${botType} bot. Wait ${waitMinutes} minutes`);
      return false;
    }
    
    return true;
  }

  /**
   * Записывает попытку восстановления
   */
  private recordAttempt(botType: 'main' | 'notifications', success: boolean, error?: string) {
    const attempts = this.recoveryAttempts.get(botType) || [];
    attempts.push({
      timestamp: Date.now(),
      botType,
      success,
      error
    });
    this.recoveryAttempts.set(botType, attempts);
  }

  /**
   * Автоматически восстанавливает webhook
   */
  async recoverWebhook(botType: 'main' | 'notifications', reason: string): Promise<boolean> {
    console.log(`[Webhook Recovery] ========== RECOVERY ATTEMPT START ==========`);
    console.log(`[Webhook Recovery] Bot: ${botType}`);
    console.log(`[Webhook Recovery] Reason: ${reason}`);
    
    // Проверяем, можем ли мы попытаться восстановить
    if (!this.canAttemptRecovery(botType)) {
      console.warn(`[Webhook Recovery] Recovery blocked by rate limiting`);
      return false;
    }
    
    try {
      // Используем правильный secret для каждого бота
      const webhookSecret = botType === 'notifications'
        ? (process.env.TELEGRAM_NOTIFICATIONS_WEBHOOK_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET)
        : process.env.TELEGRAM_WEBHOOK_SECRET;
      
      if (!webhookSecret) {
        throw new Error('Webhook secret not configured');
      }
      
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.orbo.ru';
      const webhookUrl = botType === 'main' 
        ? `${baseUrl}/api/telegram/webhook`
        : `${baseUrl}/api/telegram/notifications/webhook`;
      
      console.log(`[Webhook Recovery] Setting webhook URL: ${webhookUrl}`);
      console.log(`[Webhook Recovery] Using secret for ${botType}: ${botType === 'notifications' ? 'TELEGRAM_NOTIFICATIONS_WEBHOOK_SECRET' : 'TELEGRAM_WEBHOOK_SECRET'}`);
      
      const telegramService = new TelegramService(botType === 'main' ? 'main' : 'notifications');
      
      // Устанавливаем webhook
      const result = await telegramService.setWebhookAdvanced({
        url: webhookUrl,
        secret_token: webhookSecret,
        allowed_updates: botType === 'main' 
          ? ['message', 'chat_member', 'my_chat_member']
          : ['message'],
        drop_pending_updates: false,
        max_connections: 40
      });
      
      if (!result.ok) {
        throw new Error(`Failed to set webhook: ${result.description || 'Unknown error'}`);
      }
      
      console.log(`[Webhook Recovery] ✅ Webhook successfully recovered for ${botType} bot`);
      this.recordAttempt(botType, true);
      
      // Отправляем уведомление в Telegram (опционально)
      await this.notifyRecovery(botType, true);
      
      return true;
    } catch (error: any) {
      console.error(`[Webhook Recovery] ❌ Failed to recover webhook for ${botType} bot:`, error);
      this.recordAttempt(botType, false, error.message);
      
      // Отправляем уведомление об ошибке
      await this.notifyRecovery(botType, false, error.message);
      
      return false;
    } finally {
      console.log(`[Webhook Recovery] ========== RECOVERY ATTEMPT END ==========`);
    }
  }

  /**
   * Отправляет уведомление о восстановлении (опционально)
   */
  private async notifyRecovery(botType: 'main' | 'notifications', success: boolean, error?: string) {
    try {
      // Можно отправить уведомление в Telegram или другой канал
      // Например, в специальный канал мониторинга
      const notificationChannelId = process.env.TELEGRAM_MONITORING_CHANNEL_ID;
      if (!notificationChannelId) {
        return; // Нет канала для уведомлений
      }
      
      const message = success
        ? `✅ Webhook для ${botType} бота восстановлен автоматически`
        : `❌ Не удалось восстановить webhook для ${botType} бота: ${error}`;
      
      const telegramService = new TelegramService('notifications');
      await telegramService.sendMessage(parseInt(notificationChannelId, 10), message);
    } catch (e) {
      // Игнорируем ошибки уведомлений
      console.error('[Webhook Recovery] Failed to send notification:', e);
    }
  }

  /**
   * Получает статистику восстановлений
   */
  getRecoveryStats(): Record<string, RecoveryAttempt[]> {
    const stats: Record<string, RecoveryAttempt[]> = {};
    this.recoveryAttempts.forEach((attempts, botType) => {
      stats[botType] = attempts.filter(a => Date.now() - a.timestamp < 24 * 60 * 60 * 1000); // За последние 24 часа
    });
    return stats;
  }
}

export const webhookRecoveryService = WebhookRecoveryService.getInstance();

