/**
 * Client-safe utilities for recurring events.
 * No server dependencies — safe to import in 'use client' components.
 */

export interface RecurrenceRule {
  frequency: 'weekly' | 'biweekly' | 'monthly'
  day_of_week?: number    // 1=Mon … 7=Sun
  day_of_month?: number   // 1-31, for monthly
  end_date?: string | null
}

const DAY_NAMES_ACC = ['', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье']
const DAY_NAMES_DAT = ['', 'понедельникам', 'вторникам', 'средам', 'четвергам', 'пятницам', 'субботам', 'воскресеньям']
const DAY_SHORT = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

/** "Каждую среду", "Каждые 2 недели по средам", "Ежемесячно 15-го числа" */
export function formatRecurrenceLabel(rule: RecurrenceRule | null | undefined): string {
  if (!rule) return 'Регулярное мероприятие'
  if (rule.frequency === 'weekly' && rule.day_of_week) {
    return `Каждую ${DAY_NAMES_ACC[rule.day_of_week]}`
  }
  if (rule.frequency === 'biweekly' && rule.day_of_week) {
    return `Каждые 2 недели по ${DAY_NAMES_DAT[rule.day_of_week]}`
  }
  if (rule.frequency === 'monthly' && rule.day_of_month) {
    return `Ежемесячно ${rule.day_of_month}-го числа`
  }
  return 'Регулярное мероприятие'
}

/** Short weekday label: "Ср", "Чт" */
export function getShortDayLabel(dayOfWeek: number): string {
  return DAY_SHORT[dayOfWeek] ?? ''
}
