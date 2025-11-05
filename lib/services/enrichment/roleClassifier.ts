/**
 * Behavioral Role Classifier (Rule-Based)
 * 
 * Classifies participant's role in the community based on activity patterns:
 * - Helper: Actively responds to others
 * - Bridge: Connects different people/groups
 * - Observer: Reads but rarely engages
 * - Broadcaster: Posts a lot but doesn't engage with replies
 */

interface ParticipantStats {
  messages_count: number;
  replies_sent: number;        // How many times replied to others
  replies_received: number;    // How many times others replied to them
  unique_contacts: number;     // How many different people they interacted with
  reactions_given: number;     // How many reactions they gave
  reactions_received: number;  // How many reactions they got
}

export type BehavioralRole = 'helper' | 'bridge' | 'observer' | 'broadcaster';

export interface RoleClassification {
  role: BehavioralRole;
  confidence: number; // 0-1
  description: string;
}

/**
 * Classify participant's behavioral role
 */
export function classifyBehavioralRole(stats: ParticipantStats): RoleClassification {
  // Handle edge case: no activity
  if (stats.messages_count === 0) {
    return {
      role: 'observer',
      confidence: 1.0,
      description: 'Пока не проявляет активность в сообщениях'
    };
  }
  
  // Calculate metrics
  const reply_rate = stats.replies_sent / stats.messages_count;
  const received_rate = stats.replies_received / stats.messages_count;
  const reaction_ratio = stats.reactions_given / Math.max(stats.messages_count, 1);
  const avg_contacts = stats.unique_contacts / Math.max(stats.messages_count, 1);
  
  // Helper: Actively helps others
  // - High reply rate (responds to others)
  // - Gets replies back (people value their input)
  // - Moderate to high reaction activity
  if (reply_rate > 0.5 && received_rate > 0.3) {
    return {
      role: 'helper',
      confidence: Math.min(0.95, 0.6 + (reply_rate * 0.2) + (received_rate * 0.15)),
      description: 'Активно помогает другим участникам, отвечает на вопросы'
    };
  }
  
  // Bridge: Connects people
  // - High unique contacts (talks to many different people)
  // - Moderate reply rate
  // - Presence across different discussions
  if (stats.unique_contacts > 8 && reply_rate > 0.4) {
    return {
      role: 'bridge',
      confidence: Math.min(0.9, 0.5 + (avg_contacts * 0.05) + (reply_rate * 0.2)),
      description: 'Связующее звено: общается с многими участниками, соединяет людей'
    };
  }
  
  // Broadcaster: Posts a lot but doesn't engage
  // - High message count
  // - Low reply rate (doesn't respond to others)
  // - Low received rate (doesn't get much engagement)
  if (stats.messages_count > 15 && reply_rate < 0.25) {
    return {
      role: 'broadcaster',
      confidence: Math.min(0.85, 0.5 + ((1 - reply_rate) * 0.3)),
      description: 'Активно делится информацией, но редко вступает в диалог'
    };
  }
  
  // Observer: Default for low activity
  // - Few messages
  // - Or high reaction ratio (reacts more than posts)
  if (stats.messages_count < 5 || reaction_ratio > 2) {
    return {
      role: 'observer',
      confidence: 0.7,
      description: 'Наблюдатель: следит за обсуждениями, иногда участвует'
    };
  }
  
  // Default: Observer with lower confidence
  return {
    role: 'observer',
    confidence: 0.6,
    description: 'Наблюдатель: активность ниже среднего'
  };
}

/**
 * Get role label in Russian
 */
export function getRoleLabel(role: BehavioralRole): string {
  const labels: Record<BehavioralRole, string> = {
    helper: 'Помощник',
    bridge: 'Связующий',
    observer: 'Наблюдатель',
    broadcaster: 'Вещатель'
  };
  return labels[role];
}

/**
 * Get role emoji icon
 */
export function getRoleEmoji(role: BehavioralRole): string {
  const emojis: Record<BehavioralRole, string> = {
    helper: '💬',
    bridge: '🔗',
    observer: '👁️',
    broadcaster: '📢'
  };
  return emojis[role];
}

/**
 * Get role explanation for UI tooltip
 */
export function getRoleExplanation(role: BehavioralRole): string {
  const explanations: Record<BehavioralRole, string> = {
    helper: 'Участник активно отвечает на вопросы других, делится опытом и помогает советами. Его ответы ценятся сообществом.',
    bridge: 'Участник общается с разными людьми, соединяет участников между собой, помогает налаживать связи в сообществе.',
    observer: 'Участник следит за обсуждениями, иногда комментирует, но не проявляет высокую активность в диалогах.',
    broadcaster: 'Участник активно делится информацией и новостями, но редко вступает в диалог с другими участниками.'
  };
  return explanations[role];
}

/**
 * Example usage:
 * 
 * const stats = {
 *   messages_count: 45,
 *   replies_sent: 28,
 *   replies_received: 35,
 *   unique_contacts: 12,
 *   reactions_given: 60,
 *   reactions_received: 40
 * };
 * 
 * const classification = classifyBehavioralRole(stats);
 * 
 * console.log(classification.role);         // 'helper'
 * console.log(classification.confidence);   // 0.87
 * console.log(getRoleLabel(classification.role));  // 'Помощник'
 * console.log(getRoleEmoji(classification.role));  // '💬'
 */

