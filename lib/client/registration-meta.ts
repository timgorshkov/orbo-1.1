'use client'

const STORAGE_KEY = 'orbo_reg_meta'
const COOKIE_NAME = 'orbo_reg_meta'
// Cookie on .orbo.ru is shared between orbo.ru and my.orbo.ru — solves
// the cross-subdomain attribution problem without URL parameter hacks.
const COOKIE_DOMAIN = '.orbo.ru'
const COOKIE_MAX_AGE = 86400 * 30 // 30 days

const storage: Storage | null = (() => {
  try { return typeof window !== 'undefined' ? window.localStorage : null }
  catch { return null }
})()

export interface RegistrationMeta {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  utm_term?: string
  referrer_url?: string
  landing_page?: string
  from_page?: string
  device_type?: string
  user_agent?: string
  screen_width?: number
  partner_code?: string
}

function getDeviceType(width: number): string {
  if (width < 768) return 'mobile'
  if (width < 1024) return 'tablet'
  return 'desktop'
}

// ── Cookie helpers (cross-subdomain) ─────────────────────────────────────────

function setCookie(meta: RegistrationMeta): void {
  try {
    const json = JSON.stringify(meta)
    const encoded = encodeURIComponent(json)
    document.cookie = `${COOKIE_NAME}=${encoded}; domain=${COOKIE_DOMAIN}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax; Secure`
  } catch { /* cookie too large or blocked — not critical */ }
}

function getCookie(): RegistrationMeta | null {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]+)`))
    if (!match) return null
    return JSON.parse(decodeURIComponent(match[1]))
  } catch {
    return null
  }
}

function clearCookie(): void {
  try {
    document.cookie = `${COOKIE_NAME}=; domain=${COOKIE_DOMAIN}; path=/; max-age=0; SameSite=Lax; Secure`
  } catch { /* ignore */ }
}

// ── Storage helpers (per-domain localStorage + cross-domain cookie) ──────────

function saveMeta(meta: RegistrationMeta): void {
  const json = JSON.stringify(meta)
  storage?.setItem(STORAGE_KEY, json)
  setCookie(meta)
}

// ── Partner code extraction ──────────────────────────────────────────────────

/**
 * Extracts partner/referral code from URL params.
 * Priority:
 * 1. ?via=CODE  — clean referral link
 * 2. utm_source=revroute + utm_medium=referral → utm_campaign as code (revroute compatibility)
 */
function extractPartnerCode(params: URLSearchParams): string | undefined {
  const via = params.get('via')
  if (via) return via

  if (
    params.get('utm_source') === 'revroute' &&
    params.get('utm_medium') === 'referral'
  ) {
    const campaign = params.get('utm_campaign')
    if (campaign) return campaign
  }

  return undefined
}

// ── Public API ───────────────────────────────────────────────────────────────

export function captureRegistrationMeta(): void {
  if (typeof window === 'undefined') return

  const params = new URLSearchParams(window.location.search)
  const partnerCode = extractPartnerCode(params)

  // Check existing meta: localStorage (same domain) first, then cookie (cross-domain).
  const existing = storage?.getItem(STORAGE_KEY) || null
  const existingMeta: RegistrationMeta | null = existing
    ? (() => { try { return JSON.parse(existing) } catch { return null } })()
    : getCookie()

  if (existingMeta) {
    let updated = false

    // If a partner code is present on this page visit, always update it
    if (partnerCode && !existingMeta.partner_code) {
      existingMeta.partner_code = partnerCode
      updated = true
    }

    // If we're on my.orbo.ru/signup and have meta from the cookie but not localStorage,
    // hydrate localStorage with the cookie data + supplement with signup-page context.
    if (!existing && getCookie()) {
      const fromPage = params.get('from')
      if (fromPage && !existingMeta.from_page) existingMeta.from_page = fromPage
      // Re-capture device info from THIS device (may differ from original)
      existingMeta.device_type = getDeviceType(window.innerWidth)
      existingMeta.user_agent = navigator.userAgent
      existingMeta.screen_width = window.innerWidth
      saveMeta(existingMeta)
      return
    }

    if (updated) saveMeta(existingMeta)
    return
  }

  // First visit — capture everything from browser APIs.
  const meta: RegistrationMeta = {
    utm_source: params.get('utm_source') || undefined,
    utm_medium: params.get('utm_medium') || undefined,
    utm_campaign: params.get('utm_campaign') || undefined,
    utm_content: params.get('utm_content') || undefined,
    utm_term: params.get('utm_term') || undefined,
    referrer_url: document.referrer || undefined,
    landing_page: window.location.pathname,
    from_page: params.get('from') || undefined,
    device_type: getDeviceType(window.innerWidth),
    user_agent: navigator.userAgent,
    screen_width: window.innerWidth,
    partner_code: partnerCode,
  }

  const cleaned = Object.fromEntries(
    Object.entries(meta).filter(([, v]) => v !== undefined)
  ) as RegistrationMeta

  if (Object.keys(cleaned).length > 0) {
    saveMeta(cleaned)
  }
}

export function getRegistrationMeta(): RegistrationMeta | null {
  if (typeof window === 'undefined') return null

  // localStorage first (same domain), cookie fallback (cross-domain)
  const stored = storage?.getItem(STORAGE_KEY)
  if (stored) {
    try { return JSON.parse(stored) } catch { /* fall through */ }
  }

  return getCookie()
}

export function clearRegistrationMeta(): void {
  if (typeof window === 'undefined') return
  storage?.removeItem(STORAGE_KEY)
  clearCookie()
}
