/**
 * Reaction Analyzer
 * 
 * Analyzes participant's reactions to understand:
 * - What topics/content they engage with
 * - Which emoji they use (sentiment)
 * - Who they interact with via reactions
 */

interface ReactionEvent {
  message_id: number;
  tg_user_id: number;           // Who reacted
  emoji?: string;                 // Reaction emoji
  created_at: string;
  original_message?: {
    text: string;
    author_id: number;
    author_name?: string;
  };
}

/**
 * Reaction Pattern Analysis Result
 */
export interface ReactionPatterns {
  total_reactions: number;
  favorite_emojis: Array<{ emoji: string; count: number }>;
  reacts_to_topics: string[];           // Topics participant reacts to (extracted keywords)
  reacts_to_users: Array<{              // Users participant reacts to most
    user_id: number;
    user_name?: string;
    count: number;
  }>;
  engagement_rate: number;              // Reactions / messages (if available)
  sentiment: 'positive' | 'neutral' | 'negative'; // Based on emoji
}

// Emoji sentiment mapping
const EMOJI_SENTIMENT = {
  positive: ['👍', '❤️', '🔥', '👏', '💯', '⭐', '✅', '😊', '🎉', '💪', '🙌', '😍', '🤝'],
  negative: ['👎', '💔', '😢', '😡', '❌', '🤬'],
  neutral: ['🤔', '👀', '😐', '🤷']
};

/**
 * Analyze participant's reaction patterns
 */
export function analyzeReactionPatterns(
  reactions: ReactionEvent[],
  participantMessagesCount: number = 0
): ReactionPatterns {
  if (reactions.length === 0) {
    return {
      total_reactions: 0,
      favorite_emojis: [],
      reacts_to_topics: [],
      reacts_to_users: [],
      engagement_rate: 0,
      sentiment: 'neutral'
    };
  }
  
  // 1. Count emojis
  const emojiCounts = new Map<string, number>();
  reactions.forEach(r => {
    if (r.emoji) {
      emojiCounts.set(r.emoji, (emojiCounts.get(r.emoji) || 0) + 1);
    }
  });
  
  const favorite_emojis = Array.from(emojiCounts.entries())
    .map(([emoji, count]) => ({ emoji, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  
  // 2. Determine sentiment from emojis
  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;
  
  reactions.forEach(r => {
    if (!r.emoji) return;
    if (EMOJI_SENTIMENT.positive.includes(r.emoji)) positiveCount++;
    else if (EMOJI_SENTIMENT.negative.includes(r.emoji)) negativeCount++;
    else neutralCount++;
  });
  
  let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
  if (positiveCount > negativeCount && positiveCount > neutralCount) sentiment = 'positive';
  else if (negativeCount > positiveCount) sentiment = 'negative';
  
  // 3. Extract topics from messages participant reacted to
  const topicsMap = new Map<string, number>();
  reactions.forEach(r => {
    if (r.original_message?.text) {
      // Simple keyword extraction (will be enhanced by AI later)
      const keywords = extractKeywords(r.original_message.text);
      keywords.forEach(kw => {
        topicsMap.set(kw, (topicsMap.get(kw) || 0) + 1);
      });
    }
  });
  
  const reacts_to_topics = Array.from(topicsMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([topic]) => topic);
  
  // 4. Count reactions by user
  const userReactionCounts = new Map<number, { count: number; name?: string }>();
  reactions.forEach(r => {
    if (r.original_message?.author_id) {
      const userId = r.original_message.author_id;
      const current = userReactionCounts.get(userId) || { count: 0, name: r.original_message.author_name };
      current.count++;
      userReactionCounts.set(userId, current);
    }
  });
  
  const reacts_to_users = Array.from(userReactionCounts.entries())
    .map(([user_id, data]) => ({
      user_id,
      user_name: data.name,
      count: data.count
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  
  // 5. Calculate engagement rate
  const engagement_rate = participantMessagesCount > 0
    ? reactions.length / participantMessagesCount
    : 0;
  
  return {
    total_reactions: reactions.length,
    favorite_emojis,
    reacts_to_topics,
    reacts_to_users,
    engagement_rate,
    sentiment
  };
}

/**
 * Simple keyword extraction
 * (This is a fallback; AI will do better extraction)
 */
function extractKeywords(text: string): string[] {
  // Remove common words
  const stopWords = new Set([
    'и', 'в', 'на', 'с', 'по', 'для', 'не', 'что', 'как', 'это', 'я', 'мы', 'вы', 'они',
    'а', 'но', 'или', 'же', 'бы', 'ли', 'да', 'нет', 'так', 'вот', 'там', 'тут', 'когда',
    'где', 'кто', 'что', 'почему', 'зачем', 'если', 'то', 'уже', 'еще', 'можно', 'нужно',
    'the', 'is', 'are', 'was', 'were', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for'
  ]);
  
  // Tokenize and filter
  const words = text
    .toLowerCase()
    .replace(/[^\wа-яА-ЯёЁ\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w));
  
  // Return unique words (could be enhanced with frequency, lemmatization)
  return Array.from(new Set(words)).slice(0, 10);
}

/**
 * Format reaction patterns for UI display
 */
export function formatReactionPatternsForUI(patterns: ReactionPatterns): {
  summary: string;
  details: Array<{ label: string; value: string }>;
} {
  const summary = patterns.total_reactions === 0
    ? 'Участник редко ставит реакции'
    : `Участник активен в реакциях (${patterns.total_reactions} реакций), преимущественно ${
        patterns.sentiment === 'positive' ? 'позитивные' : 
        patterns.sentiment === 'negative' ? 'негативные' : 'нейтральные'
      }`;
  
  const details: Array<{ label: string; value: string }> = [
    {
      label: 'Любимые эмодзи',
      value: patterns.favorite_emojis.map(e => `${e.emoji} (${e.count})`).join(', ') || 'Нет данных'
    },
    {
      label: 'Реагирует на темы',
      value: patterns.reacts_to_topics.join(', ') || 'Нет данных'
    },
    {
      label: 'Чаще реагирует на',
      value: patterns.reacts_to_users.map(u => u.user_name || `ID${u.user_id}`).join(', ') || 'Нет данных'
    }
  ];
  
  return { summary, details };
}

/**
 * Example usage:
 * 
 * const reactions = [
 *   {
 *     message_id: 123,
 *     tg_user_id: 456,
 *     emoji: '👍',
 *     created_at: '2025-11-04',
 *     original_message: {
 *       text: 'Кто знает хорошего дизайнера?',
 *       author_id: 789,
 *       author_name: 'Иван'
 *     }
 *   },
 *   ...
 * ];
 * 
 * const patterns = analyzeReactionPatterns(reactions, 50);
 * 
 * console.log(patterns.favorite_emojis);    // [{ emoji: '👍', count: 15 }]
 * console.log(patterns.reacts_to_topics);   // ['дизайн', 'веб-разработка']
 * console.log(patterns.sentiment);          // 'positive'
 */

