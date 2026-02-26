/**
 * Parser for Telegram JSON export format
 * JSON format provides user_id which is crucial for participant matching
 */

import { createServiceLogger } from '@/lib/logger';

const logger = createServiceLogger('TelegramJsonParser');

export interface ParsedJsonMessage {
  authorName: string;
  authorUserId?: number; // ⭐ KEY ADVANTAGE: Telegram user ID from JSON
  authorUsername?: string;
  text: string;
  timestamp: Date;
  messageId: number;
  replyTo?: number;
  charCount: number;
  linksCount: number;
  mentionsCount: number;
}

export interface ParsedJsonAuthor {
  name: string;
  userId?: number; // ⭐ Telegram user ID
  username?: string;
  messageCount: number;
  firstMessageDate: Date;
  lastMessageDate: Date;
}

export interface JsonParsingResult {
  messages: ParsedJsonMessage[];
  authors: Map<string, ParsedJsonAuthor>;
  chatId: number; // ⭐ Chat ID from JSON export
  dateRange: {
    start: Date;
    end: Date;
  };
  stats: {
    totalMessages: number;
    uniqueAuthors: number;
    chatName: string;
    chatType: string;
  };
}

interface TelegramJsonExport {
  name: string;
  type: string;
  id: number;
  messages: TelegramJsonMessage[];
}

interface TelegramJsonMessage {
  id: number;
  type: string;
  date: string;
  from?: string;
  from_id?: string; // Format: "user1234567890" or "channel1234567890"
  text?: string | TextEntity[];
  text_entities?: TextEntity[];
  reply_to_message_id?: number;
}

interface TextEntity {
  type: string;
  text: string;
}

/**
 * Parses Telegram JSON export
 */
export class TelegramJsonParser {
  /**
   * Validates JSON export structure
   */
  static validate(jsonContent: string): { valid: boolean; error?: string } {
    try {
      const data = JSON.parse(jsonContent);
      
      if (!data || typeof data !== 'object') {
        return { valid: false, error: 'Invalid JSON: root must be an object' };
      }
      
      if (!data.name || typeof data.name !== 'string') {
        return { valid: false, error: 'Invalid JSON: missing or invalid "name" field' };
      }
      
      if (!data.messages || !Array.isArray(data.messages)) {
        return { valid: false, error: 'Invalid JSON: missing or invalid "messages" array' };
      }
      
      if (data.messages.length === 0) {
        return { valid: false, error: 'Invalid JSON: empty messages array' };
      }
      
      // Validate first message structure
      const firstMsg = data.messages[0];
      if (!firstMsg.id || !firstMsg.date) {
        return { valid: false, error: 'Invalid JSON: messages must have "id" and "date"' };
      }
      
      return { valid: true };
    } catch (error: any) {
      return { valid: false, error: `JSON parse error: ${error.message}` };
    }
  }

  /**
   * Parses JSON export content
   */
  static parse(jsonContent: string): JsonParsingResult {
    const data: TelegramJsonExport = JSON.parse(jsonContent);
    const messages: ParsedJsonMessage[] = [];
    const authorsMap = new Map<string, ParsedJsonAuthor>();

    for (const msg of data.messages) {
      try {
        const parsedMessage = this.parseMessage(msg);
        if (parsedMessage) {
          messages.push(parsedMessage);

          // Update author statistics
          const authorKey = parsedMessage.authorUserId 
            ? `user_${parsedMessage.authorUserId}` 
            : (parsedMessage.authorUsername || parsedMessage.authorName);
          
          const existingAuthor = authorsMap.get(authorKey);

          if (existingAuthor) {
            existingAuthor.messageCount++;
            if (parsedMessage.timestamp < existingAuthor.firstMessageDate) {
              existingAuthor.firstMessageDate = parsedMessage.timestamp;
            }
            if (parsedMessage.timestamp > existingAuthor.lastMessageDate) {
              existingAuthor.lastMessageDate = parsedMessage.timestamp;
            }
          } else {
            authorsMap.set(authorKey, {
              name: parsedMessage.authorName,
              userId: parsedMessage.authorUserId,
              username: parsedMessage.authorUsername,
              messageCount: 1,
              firstMessageDate: parsedMessage.timestamp,
              lastMessageDate: parsedMessage.timestamp,
            });
          }
        }
      } catch (error) {
        logger.warn({ 
          message_id: msg.id,
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to parse message');
        // Continue parsing other messages
      }
    }

    // Calculate date range
    const dates = messages.map(m => m.timestamp).sort((a, b) => a.getTime() - b.getTime());
    const dateRange = {
      start: dates[0] || new Date(),
      end: dates[dates.length - 1] || new Date(),
    };

    return {
      messages,
      authors: authorsMap,
      chatId: data.id, // ⭐ Chat ID from JSON export
      dateRange,
      stats: {
        totalMessages: messages.length,
        uniqueAuthors: authorsMap.size,
        chatName: data.name,
        chatType: data.type,
      },
    };
  }

  /**
   * Parses a single message
   */
  private static parseMessage(msg: TelegramJsonMessage): ParsedJsonMessage | null {
    // Skip service messages
    if (msg.type !== 'message') {
      return null;
    }

    // Extract author name
    const authorName = msg.from || 'Unknown';

    // Extract user/channel ID from from_id (format: "user1234567890" or "channel1234567890")
    let authorUserId: number | undefined;
    if (msg.from_id) {
      const userMatch = msg.from_id.match(/user(\d+)/);
      if (userMatch) {
        authorUserId = parseInt(userMatch[1], 10);
      } else {
        const channelMatch = msg.from_id.match(/channel(\d+)/);
        if (channelMatch) {
          authorUserId = -parseInt(channelMatch[1], 10);
        }
      }
    }

    // Parse timestamp and normalize to UTC
    // Telegram JSON exports use ISO string format (e.g., "2025-10-23T16:27:49")
    // We need to ensure it's parsed as UTC to avoid timezone issues
    let timestamp: Date;
    if (typeof msg.date === 'string') {
      // If date is ISO string without timezone, assume UTC
      // If it has timezone info, Date will parse it correctly
      timestamp = new Date(msg.date);
      // Normalize to UTC to avoid timezone-related duplicates
      if (!msg.date.includes('Z') && !msg.date.includes('+') && !msg.date.includes('-', 10)) {
        // Date string without timezone - assume UTC
        timestamp = new Date(msg.date + 'Z');
      }
    } else if (typeof msg.date === 'number') {
      // Unix timestamp (seconds) - convert to milliseconds and create UTC date
      timestamp = new Date(msg.date * 1000);
    } else {
      return null;
    }
    
    if (isNaN(timestamp.getTime())) {
      logger.warn({ date: msg.date }, 'Invalid date format');
      return null;
    }
    
    // Ensure timestamp is in UTC (normalize)
    timestamp = new Date(Date.UTC(
      timestamp.getUTCFullYear(),
      timestamp.getUTCMonth(),
      timestamp.getUTCDate(),
      timestamp.getUTCHours(),
      timestamp.getUTCMinutes(),
      timestamp.getUTCSeconds(),
      timestamp.getUTCMilliseconds()
    ));

    // Extract text
    let text = '';
    if (typeof msg.text === 'string') {
      text = msg.text;
    } else if (Array.isArray(msg.text)) {
      text = msg.text.map(entity => entity.text || '').join('');
    } else if (Array.isArray(msg.text_entities)) {
      text = msg.text_entities.map(entity => entity.text || '').join('');
    }

    text = text.trim();
    if (!text) {
      return null; // Skip empty messages (media without text)
    }

    // Count links and mentions
    const linksCount = (text.match(/https?:\/\/[^\s]+/g) || []).length;
    const mentionsCount = (text.match(/@\w+/g) || []).length;

    return {
      authorName,
      authorUserId,
      text,
      timestamp,
      messageId: msg.id,
      replyTo: msg.reply_to_message_id,
      charCount: text.length,
      linksCount,
      mentionsCount,
    };
  }

  /**
   * Checks if author is a bot
   */
  static isBot(author: ParsedJsonAuthor): boolean {
    // Check if user ID starts with specific bot prefix (if applicable)
    // Most Telegram bots have IDs in a specific range or patterns
    
    // Check username ends with 'bot'
    if (author.username?.toLowerCase().endsWith('bot')) {
      return true;
    }

    // Check known bot names
    const knownBots = ['orbo', 'bot', 'telegram', 'channel'];
    const lowerName = author.name.toLowerCase().trim();
    if (knownBots.some(bot => lowerName.includes(bot))) {
      return true;
    }

    return false;
  }
}

