/**
 * Tiny Mustache-like template renderer for confirmation messages.
 *
 * Supports:
 *   {{var.path}}           — substitution; missing → empty string
 *   {{#if var.path}}…{{/if}} — render block only if path is truthy
 *   {{#unless var.path}}…{{/unless}} — render block only if path is falsy
 *
 * Intentionally simple — we control both the inputs and the templates,
 * so we don't need html-escaping or anti-injection logic here. (The renderer
 * outputs raw markdown; HTML conversion happens later in marked, which is
 * what handles untrusted-content escaping.)
 */

export type TemplateVars = Record<string, any>;

/**
 * Apply variables and condition blocks to a template string.
 * Order: if/unless blocks first (so block bodies don't get partial substitutions),
 * then variable replacement on the result.
 */
export function applyTemplate(template: string, vars: TemplateVars): string {
  if (!template) return '';
  let out = template;

  // Run a fixed number of passes so nested {{#if}} blocks resolve.
  // Cap at 5 — deeper nesting is unsupported by design.
  for (let pass = 0; pass < 5; pass++) {
    const before = out;
    out = out.replace(
      /\{\{#if\s+([\w.]+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
      (_, key: string, body: string) => (truthy(getValue(vars, key)) ? body : '')
    );
    out = out.replace(
      /\{\{#unless\s+([\w.]+)\}\}([\s\S]*?)\{\{\/unless\}\}/g,
      (_, key: string, body: string) => (truthy(getValue(vars, key)) ? '' : body)
    );
    if (out === before) break;
  }

  // Variable substitution
  out = out.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const v = getValue(vars, key);
    return v == null ? '' : String(v);
  });

  return out;
}

function truthy(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function getValue(vars: TemplateVars, path: string): any {
  return path.split('.').reduce<any>((acc, p) => (acc == null ? undefined : acc[p]), vars);
}

/** List of supported variable placeholders — for the editor "insert variable" menu. */
export const TEMPLATE_VARIABLES = [
  { key: 'event.title', label: 'Название события' },
  { key: 'event.date', label: 'Дата (например, «27 апреля 2026»)' },
  { key: 'event.time', label: 'Время начала (HH:MM)' },
  { key: 'event.endTime', label: 'Время окончания (HH:MM, может быть пусто)' },
  { key: 'event.location', label: 'Место проведения (или «Онлайн»)' },
  { key: 'event.url', label: 'Ссылка на страницу события' },
  { key: 'participant.name', label: 'Имя участника' },
  { key: 'org.name', label: 'Название организации' },
  { key: 'ticket.shortCode', label: 'Короткий код билета (XXXX-YYYY)' },
  { key: 'ticket.amount', label: 'Сумма оплаченного билета (₽)' },
  { key: 'ticket.paid', label: 'Оплачено (true/false) — для условного блока' },
  { key: 'ticket.requiresPayment', label: 'Платное ли событие — для условного блока' },
] as const;

/** Default template applied when an org has no custom one configured. */
export const DEFAULT_EVENT_EMAIL_TEMPLATE = {
  subject: 'Регистрация: {{event.title}}',
  bodyMarkdown:
    `{{participant.name}}, вы успешно зарегистрированы на мероприятие:\n\n` +
    `**{{event.title}}**\n\n` +
    `📅 Дата: {{event.date}}\n` +
    `🕒 Время: {{event.time}}{{#if event.endTime}} — {{event.endTime}}{{/if}}\n` +
    `{{#if event.location}}📍 Место: {{event.location}}\n{{/if}}` +
    `{{#if ticket.paid}}\n💳 Оплачено: {{ticket.amount}} ₽\n{{/if}}` +
    `{{#unless ticket.paid}}{{#if ticket.requiresPayment}}\n⚠️ Билет ещё не оплачен.\n{{/if}}{{/unless}}` +
    `\n[Подробнее о событии]({{event.url}})`,
  qrInstructionMarkdown:
    `Если QR не считается на входе — назовите короткий код билета **{{ticket.shortCode}}**.`,
} as const;
