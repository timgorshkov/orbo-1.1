'use client'

const STORAGE_KEY = 'orbo_reg_meta'

// localStorage persists across browser sessions (unlike sessionStorage which dies when tab closes).
// This is intentional: we want partner/UTM attribution to survive multi-day consideration cycles.
// clearRegistrationMeta() is called after successful registration to avoid stale data.
const storage = typeof window !== 'undefined' ? window.localStorage : null

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

export function captureRegistrationMeta(): void {
  if (typeof window === 'undefined') return

  const params = new URLSearchParams(window.location.search)

  // _rm = full meta encoded by UTMLinkEnricher when navigating from orbo.ru to my.orbo.ru.
  // Takes priority over local browser API values: preserves real external referrer and
  // the first landing page on orbo.ru instead of recording /signup + orbo.ru as referrer.
  const rm = params.get('_rm')
  if (rm) {
    try {
      const transferred: RegistrationMeta = JSON.parse(decodeURIComponent(escape(atob(rm))))
      // Supplement with current device info in case it wasn't captured on orbo.ru
      if (!transferred.device_type) transferred.device_type = getDeviceType(window.innerWidth)
      if (!transferred.user_agent)  transferred.user_agent  = navigator.userAgent
      if (!transferred.screen_width) transferred.screen_width = window.innerWidth
      storage?.setItem(STORAGE_KEY, JSON.stringify(transferred))
      return
    } catch {
      // malformed _rm — fall through to normal capture
    }
  }

  const partnerCode = extractPartnerCode(params)

  const existing = storage?.getItem(STORAGE_KEY)
  if (existing) {
    // If a partner/referral code is present on this page visit, always update it
    // even if attribution was already captured (partner link may come after first visit)
    if (partnerCode) {
      try {
        const parsed: RegistrationMeta = JSON.parse(existing)
        if (!parsed.partner_code) {
          parsed.partner_code = partnerCode
          storage?.setItem(STORAGE_KEY, JSON.stringify(parsed))
        }
      } catch {
        // ignore parse errors
      }
    }
    return
  }

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
  )

  if (Object.keys(cleaned).length > 0) {
    storage?.setItem(STORAGE_KEY, JSON.stringify(cleaned))
  }
}

export function getRegistrationMeta(): RegistrationMeta | null {
  if (typeof window === 'undefined') return null
  const stored = storage?.getItem(STORAGE_KEY)
  if (!stored) return null
  try {
    return JSON.parse(stored)
  } catch {
    return null
  }
}

export function clearRegistrationMeta(): void {
  if (typeof window === 'undefined') return
  storage?.removeItem(STORAGE_KEY)
}
