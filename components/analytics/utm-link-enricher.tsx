'use client'

import { useEffect } from 'react'
import { getRegistrationMeta } from '@/lib/client/registration-meta'

/**
 * Fallback enricher: appends UTM/partner params to signup links for cases
 * where cookies are blocked (strict privacy settings, cross-site cookie policies).
 *
 * Primary cross-domain transfer now happens via a .orbo.ru cookie set by
 * captureRegistrationMeta(). This component is a safety net only.
 */
export function UTMLinkEnricher() {
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const link = (e.target as Element).closest<HTMLAnchorElement>('a[href*="/signup"]')
      if (!link) return

      try {
        const url = new URL(link.href)
        if (!url.hostname.endsWith('orbo.ru')) return

        const meta = getRegistrationMeta()
        if (!meta) return

        // Only append UTM/partner params — landing_page and referrer transfer via cookie
        let changed = false
        if (meta.utm_source && !url.searchParams.has('utm_source'))     { url.searchParams.set('utm_source', meta.utm_source); changed = true }
        if (meta.utm_medium && !url.searchParams.has('utm_medium'))     { url.searchParams.set('utm_medium', meta.utm_medium); changed = true }
        if (meta.utm_campaign && !url.searchParams.has('utm_campaign')) { url.searchParams.set('utm_campaign', meta.utm_campaign); changed = true }
        if (meta.partner_code && !url.searchParams.has('via'))          { url.searchParams.set('via', meta.partner_code); changed = true }

        if (changed) {
          e.preventDefault()
          window.location.href = url.toString()
        }
      } catch {
        // let the original navigation proceed
      }
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  return null
}
