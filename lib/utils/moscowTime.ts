/**
 * Moscow time helpers.
 *
 * Все события в Orbo хранятся как `event_date` (date) + `start_time` (time)
 * без указания таймзоны. По договорённости это локальное время Москвы.
 *
 * Сервер крутится в Docker-контейнере с TZ=UTC, поэтому штатные методы
 * `Date#getHours`, `Date#toISOString`, `Date#toLocaleString('ru-RU')` дают
 * UTC-значения и не совпадают с тем, что вводил пользователь. Эти хелперы
 * явно работают с зоной Europe/Moscow вне зависимости от TZ контейнера.
 */

const MOSCOW_TZ = 'Europe/Moscow';

interface MoscowParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}

function moscowParts(d: Date): MoscowParts {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: MOSCOW_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(d).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  // `hour` в en-CA с hour12=false иногда возвращает "24" вместо "00" в полночь — нормализуем.
  if (parts.hour === '24') parts.hour = '00';
  return parts as unknown as MoscowParts;
}

/** YYYY-MM-DD в часовой зоне Москвы. */
export function moscowDateString(d: Date = new Date()): string {
  const p = moscowParts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

/** HH:mm в часовой зоне Москвы. */
export function moscowTimeString(d: Date = new Date()): string {
  const p = moscowParts(d);
  return `${p.hour}:${p.minute}`;
}

/** Сдвинуть на N миллисекунд и вернуть YYYY-MM-DD в МСК. */
export function moscowDateStringOffset(d: Date, offsetMs: number): string {
  return moscowDateString(new Date(d.getTime() + offsetMs));
}

/**
 * Возвращает абсолютное время начала события (UTC Date) для записи
 * `event_date` (YYYY-MM-DD) + `start_time` (HH:mm[:ss]) в МСК.
 *
 * Реализация без зависимостей от TZ контейнера: формируем строку в формате
 * 'YYYY-MM-DDTHH:mm:ss+03:00', и `new Date(...)` корректно парсит её в UTC.
 *
 * Внимание: 03:00 — фиксированный сдвиг МСК. Если когда-нибудь потребуется
 * поддержка событий в других зонах, этот хелпер нужно будет расширить
 * параметром tz, и складывать его не статической строкой, а через Intl.
 */
export function eventStartUtc(eventDate: string, startTime: string): Date {
  const time = startTime.length >= 5 ? startTime.substring(0, 8) : `${startTime}:00`;
  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  return new Date(`${eventDate}T${normalizedTime}+03:00`);
}

/**
 * `now` (или произвольный момент) сместить на offsetMs и получить
 * { date: 'YYYY-MM-DD', time: 'HH:mm' } в МСК. Удобно при формировании
 * окон для cron'ов «через час начнётся».
 */
export function moscowDateTimeAt(d: Date, offsetMs: number = 0): { date: string; time: string } {
  const m = new Date(d.getTime() + offsetMs);
  const p = moscowParts(m);
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
  };
}
