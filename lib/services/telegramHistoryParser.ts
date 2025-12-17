import { parse } from 'node-html-parser';
import { createServiceLogger } from '@/lib/logger';

const logger = createServiceLogger('TelegramHistoryParser');

export interface ParsedMessage {
  authorName: string;
  authorUsername?: string;
  text: string;
  timestamp: Date;
  replyTo?: string;
  charCount: number;
  linksCount: number;
  mentionsCount: number;
}

export interface ParsedAuthor {
  name: string;
  username?: string;
  messageCount: number;
  firstMessageDate: Date;
  lastMessageDate: Date;
}

export interface ParsingResult {
  messages: ParsedMessage[];
  authors: Map<string, ParsedAuthor>;
  dateRange: {
    start: Date;
    end: Date;
  };
  stats: {
    totalMessages: number;
    uniqueAuthors: number;
    dateFormat: string;
  };
}

/**
 * Парсит HTML экспорт Telegram и извлекает сообщения
 */
export class TelegramHistoryParser {
  /**
   * Парсит HTML контент экспорта Telegram
   */
  static parse(htmlContent: string): ParsingResult {
    const root = parse(htmlContent);
    const messages: ParsedMessage[] = [];
    const authorsMap = new Map<string, ParsedAuthor>();

    // Находим все сообщения
    const messageElements = root.querySelectorAll('.message');
    messageElements.forEach((element) => {
      try {
        const message = this.parseMessage(element);
        if (message) {
          messages.push(message);

          // Обновляем статистику автора
          const authorKey = message.authorUsername || message.authorName;
          const existingAuthor = authorsMap.get(authorKey);

          if (existingAuthor) {
            existingAuthor.messageCount++;
            if (message.timestamp < existingAuthor.firstMessageDate) {
              existingAuthor.firstMessageDate = message.timestamp;
            }
            if (message.timestamp > existingAuthor.lastMessageDate) {
              existingAuthor.lastMessageDate = message.timestamp;
            }
          } else {
            authorsMap.set(authorKey, {
              name: message.authorName,
              username: message.authorUsername,
              messageCount: 1,
              firstMessageDate: message.timestamp,
              lastMessageDate: message.timestamp,
            });
          }
        }
      } catch (error) {
        logger.warn({ 
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to parse message');
        // Продолжаем парсинг остальных сообщений
      }
    });

    // Вычисляем диапазон дат
    const dates = messages.map(m => m.timestamp).sort((a, b) => a.getTime() - b.getTime());
    const dateRange = {
      start: dates[0] || new Date(),
      end: dates[dates.length - 1] || new Date(),
    };

    return {
      messages,
      authors: authorsMap,
      dateRange,
      stats: {
        totalMessages: messages.length,
        uniqueAuthors: authorsMap.size,
        dateFormat: 'detected', // TODO: определять формат
      },
    };
  }

  /**
   * Парсит отдельное сообщение
   */
  private static parseMessage(element: any): ParsedMessage | null {
    // Пропускаем служебные сообщения (join/leave)
    if (element.classList?.contains('service')) {
      return null;
    }

    // Извлекаем автора
    const authorElement = element.querySelector('.from_name');
    if (!authorElement) {
      return null;
    }

    const authorName = authorElement.text?.trim() || '';
    if (!authorName) {
      return null;
    }

    // Извлекаем username если есть
    const authorHref = authorElement.getAttribute('href');
    const authorUsername = authorHref?.match(/@(\w+)/)?.[1];

    // Извлекаем дату и время
    const dateElement = element.querySelector('.date, .pull_right.date');
    if (!dateElement) {
      return null;
    }
    
    const dateText = dateElement.getAttribute('title') || dateElement.text?.trim() || '';
    const timestamp = this.parseDate(dateText);

    if (!timestamp) {
      return null;
    }

    // Извлекаем текст сообщения
    const textElement = element.querySelector('.text');
    const text = textElement?.text?.trim() || '';

    if (!text) {
      return null; // Пропускаем пустые сообщения (медиа без текста)
    }

    // Извлекаем reply_to если есть
    const replyElement = element.querySelector('.reply_to');
    const replyTo = replyElement ? replyElement.text?.trim() : undefined;

    // Подсчитываем метрики
    const charCount = text.length;
    const linksCount = (text.match(/https?:\/\/[^\s]+/gi) || []).length;
    const mentionsCount = (text.match(/@\w+/g) || []).length;

    return {
      authorName,
      authorUsername,
      text,
      timestamp,
      replyTo,
      charCount,
      linksCount,
      mentionsCount,
    };
  }

  /**
   * Парсит дату из разных форматов Telegram экспорта
   */
  private static parseDate(dateStr: string): Date | null {
    if (!dateStr) return null;

    // Формат: "27.10.2024 14:30:45"
    const ddmmyyyyMatch = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (ddmmyyyyMatch) {
      const [, day, month, year, hour, minute, second] = ddmmyyyyMatch;
      return new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second)
      );
    }

    // Формат ISO: "2024-10-27T14:30:45"
    const isoMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
    if (isoMatch) {
      return new Date(dateStr);
    }

    // Попытка parse как есть
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  /**
   * Валидирует HTML контент как экспорт Telegram
   */
  static validate(htmlContent: string): { valid: boolean; error?: string } {
    if (!htmlContent || htmlContent.length === 0) {
      return { valid: false, error: 'Файл пуст' };
    }

    // Проверяем минимальный размер
    if (htmlContent.length < 100) {
      return { valid: false, error: 'Файл слишком мал для экспорта Telegram' };
    }

    // Проверяем наличие характерных элементов Telegram экспорта
    const root = parse(htmlContent);

    const messages = root.querySelectorAll('.message');
    if (messages.length === 0) {
      return { valid: false, error: 'Не найдены сообщения в HTML файле. Убедитесь, что это экспорт из Telegram.' };
    }

    const body = root.querySelector('body');
    const hasHistory = body?.classList?.contains('history') || root.querySelectorAll('.history').length > 0;
    if (!hasHistory) {
      return { valid: false, error: 'HTML файл не похож на экспорт истории Telegram' };
    }

    return { valid: true };
  }
}

