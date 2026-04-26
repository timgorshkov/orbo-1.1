/**
 * QR ticket helpers — short code derived from qr_token for manual entry.
 *
 * The full qr_token is a UUID (32 hex chars). For visual readability we
 * surface the LAST 8 hex characters, uppercased and grouped as XXXX-XXXX.
 * Last-chars (rather than first) is intentional: the first chars of a UUIDv4
 * are time-derived for some implementations, but for gen_random_uuid (v4) all
 * positions are random — last is fine and avoids accidental clustering with
 * any future change.
 *
 * This short code is SAFE to expose publicly because:
 * 1. The /api/events/checkin POST endpoint requires registrator-or-admin auth.
 * 2. Brute-forcing 8 hex chars (~4 billion combos) per registration is
 *    infeasible against an authenticated rate-limited endpoint.
 */

const SHORT_LENGTH = 8

/**
 * Extract the user-facing short code from a qr_token.
 * Returns "ABCD-1234" style string.
 */
export function getShortCode(qrToken: string | null | undefined): string {
  if (!qrToken) return ''
  // Strip dashes from UUID before slicing so length is consistent.
  const compact = qrToken.replace(/-/g, '').toUpperCase()
  const tail = compact.slice(-SHORT_LENGTH)
  if (tail.length < SHORT_LENGTH) return tail
  return `${tail.slice(0, 4)}-${tail.slice(4)}`
}

/**
 * Normalize a user-entered short code: strip whitespace + dashes, uppercase.
 * Returns 8-char string or empty if input invalid.
 */
export function normalizeShortCode(input: string): string {
  if (!input) return ''
  const clean = input.replace(/[\s-]+/g, '').toUpperCase()
  return clean
}

/**
 * Build a SQL LIKE pattern to look up a registration by short code.
 * Matches qr_tokens whose last 8 hex chars (after stripping dashes) equal the code.
 *
 * Caller should run:
 *   SELECT ... FROM event_registrations
 *   WHERE UPPER(REPLACE(qr_token, '-', '')) LIKE $1
 * with the value returned here.
 */
export function shortCodeToLikePattern(shortCode: string): string {
  return `%${normalizeShortCode(shortCode)}`
}
