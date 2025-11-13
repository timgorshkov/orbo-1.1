/**
 * Weekly Digest Template
 * Formats digest data for Telegram markdown
 * Style: Friendly, minimal emojis, clean formatting
 */

import { WeeklyDigest } from '@/lib/services/weeklyDigestService';

/**
 * Format percentage change with trend indicator
 */
function formatChange(current: number, previous: number): string {
  if (previous === 0) {
    return current > 0 ? '+100%' : '0%';
  }
  
  const change = Math.round(((current - previous) / previous) * 100);
  if (change === 0) return '→';
  
  const sign = change > 0 ? '+' : '';
  return `${sign}${change}%`;
}

/**
 * Format date range for header
 */
function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
  const startStr = startDate.toLocaleDateString('ru-RU', options);
  const endStr = endDate.toLocaleDateString('ru-RU', options);
  
  return `${startStr} — ${endStr}`;
}

/**
 * Format digest for Telegram
 */
export function formatDigestForTelegram(digest: WeeklyDigest): string {
  const { keyMetrics, topContributors, attentionZones, upcomingEvents, aiInsights, suggestedActions } = digest;
  const { current, previous } = keyMetrics;

  // Header
  const header = `📊 Еженедельный дайджест: ${digest.orgName}
${formatDateRange(digest.dateRange.start, digest.dateRange.end)}

━━━━━━━━━━━━━━━━━━━━`;

  // Section 1: Activity Pulse
  const activitySection = `
📈 Активность сообщества

Сообщений: ${current.messages} (${formatChange(current.messages, previous.messages)})
Активных участников: ${current.active_participants} (${formatChange(current.active_participants, previous.active_participants)})
Ответов: ${current.replies} (${formatChange(current.replies, previous.replies)})
Реакций: ${current.reactions} (${formatChange(current.reactions, previous.reactions)})`;

  // Section 2: Top Contributors
  let contributorsSection = '';
  if (topContributors.length > 0) {
    contributorsSection = `
━━━━━━━━━━━━━━━━━━━━

🌟 Топ участников

${topContributors.map((c, i) => {
  const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
  const newBadge = c.is_new_to_top ? ' (новый в топе)' : '';
  return `${medal} ${c.name}: ${c.messages} сообщений${newBadge}`;
}).join('\n')}`;
  }

  // Section 3: Attention Zones
  let attentionSection = '';
  if (attentionZones.inactive_newcomers > 0 || attentionZones.silent_members > 0) {
    const items = [];
    if (attentionZones.inactive_newcomers > 0) {
      items.push(`⚠️ ${attentionZones.inactive_newcomers} новичков без активности (72+ часа)`);
    }
    if (attentionZones.silent_members > 0) {
      items.push(`⏸ ${attentionZones.silent_members} участников молчат 14+ дней`);
    }

    attentionSection = `
━━━━━━━━━━━━━━━━━━━━

🚨 Зоны внимания

${items.join('\n')}`;
  }

  // Section 4: Upcoming Events
  let eventsSection = '';
  if (upcomingEvents.length > 0) {
    const eventsList = upcomingEvents.map(event => {
      const date = new Date(event.start_time);
      const dateStr = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
      const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      
      return `📅 ${event.title}
   ${dateStr} в ${timeStr}${event.location ? ` • ${event.location}` : ''}
   Зарегистрировано: ${event.registration_count} участников`;
    }).join('\n\n');

    eventsSection = `
━━━━━━━━━━━━━━━━━━━━

📆 Ближайшие события

${eventsList}`;
  }

  // Section 5: Suggested Actions
  let actionsSection = '';
  if (suggestedActions.length > 0) {
    const actionsList = suggestedActions.map((action, i) => {
      const priority = action.priority === 'high' ? '🔴' : action.priority === 'medium' ? '🟡' : '⚪️';
      return `${i + 1}. ${action.title}
   ${action.description}`;
    }).join('\n\n');

    actionsSection = `
━━━━━━━━━━━━━━━━━━━━

💡 Рекомендации

${actionsList}`;
  }

  return header + activitySection + contributorsSection + attentionSection + eventsSection + actionsSection;
}

/**
 * Format digest for email (HTML)
 */
export function formatDigestForEmail(digest: WeeklyDigest): { subject: string; html: string } {
  const subject = `📊 Еженедельный дайджест: ${digest.orgName}`;
  
  // For now, use Telegram format as plaintext in <pre>
  // TODO: Create proper HTML template
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; }
    .container { max-width: 600px; margin: 20px auto; background: white; padding: 30px; border-radius: 8px; }
    pre { white-space: pre-wrap; font-family: inherit; }
  </style>
</head>
<body>
  <div class="container">
    <pre>${formatDigestForTelegram(digest)}</pre>
  </div>
</body>
</html>`;

  return { subject, html };
}

