/**
 * Client-side helpers for Telegram Mini Apps.
 *
 * These run in the browser (inside the Telegram WebView) and assume
 * `window.Telegram.WebApp` is loaded. They are safe to call when it is not —
 * they no-op gracefully so SSR / non-Telegram contexts don't crash.
 */

/**
 * Asks Telegram to show the native "Allow @bot to send you messages?" prompt.
 *
 * Why we need this: opening a Mini App via a direct deep link
 * (`t.me/orbo_event_bot/app?startapp=…`) does NOT count as a `/start`. The
 * bot stays unable to initiate conversation with the user, which means
 * post-registration confirmations and event reminders fail with 403
 * "bot can't initiate conversation with a user" — even though the user
 * obviously interacted with the bot's app.
 *
 * `requestWriteAccess` shows a system dialog inside Telegram. If the user
 * grants it, sendMessage to that user starts working immediately, just as
 * if they had typed /start.
 *
 * Available since Bot API 7.2 (April 2024). Older clients ignore it. Telegram
 * caches the user's answer per-bot, so this is safe to call on every Mini App
 * open — repeat calls won't re-prompt a user who already decided.
 */
export function requestTelegramWriteAccess(): void {
  if (typeof window === 'undefined') return
  const tg = (window as any).Telegram?.WebApp
  if (!tg || typeof tg.requestWriteAccess !== 'function') return
  // Some clients ship requestWriteAccess but on a version below 7.2 — guard
  // against it to avoid a runtime exception in older builds.
  if (typeof tg.isVersionAtLeast === 'function' && !tg.isVersionAtLeast('7.2')) return
  try {
    tg.requestWriteAccess()
  } catch {
    // Best-effort: write access is a UX nicety, email is the reliable channel.
  }
}
