'use client'

const STORAGE_KEY = 'orbo_reg_meta'

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
}

function getDeviceType(width: number): string {
  if (width < 768) return 'mobile'
  if (width < 1024) return 'tablet'
  return 'desktop'
}

export function captureRegistrationMeta(): void {
  if (typeof window === 'undefined') return

  const existing = sessionStorage.getItem(STORAGE_KEY)
  if (existing) return

  const params = new URLSearchParams(window.location.search)

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
  }

  const cleaned = Object.fromEntries(
    Object.entries(meta).filter(([, v]) => v !== undefined)
  )

  if (Object.keys(cleaned).length > 0) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned))
  }
}

export function getRegistrationMeta(): RegistrationMeta | null {
  if (typeof window === 'undefined') return null
  const stored = sessionStorage.getItem(STORAGE_KEY)
  if (!stored) return null
  try {
    return JSON.parse(stored)
  } catch {
    return null
  }
}

export function clearRegistrationMeta(): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(STORAGE_KEY)
}
