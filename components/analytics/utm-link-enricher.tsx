'use client'

import { useEffect } from 'react'
import { getRegistrationMeta } from '@/lib/client/registration-meta'

/**
 * Reads UTM/partner data stored in sessionStorage (by RegistrationMetaCapture)
 * and appends it to all signup links on the page.
 *
 * This solves the cross-domain attribution gap: orbo.ru captures UTMs in
 * sessionStorage, but my.orbo.ru can't access it. By enriching the link href
 * before navigation, the params arrive at my.orbo.ru/signup in the URL and
 * get re-captured there.
 */
export function UTMLinkEnricher() {
  useEffect(() => {
    const meta = getRegistrationMeta()
    if (!meta) return

    const params = new URLSearchParams()
    if (meta.utm_source)   params.set('utm_source',   meta.utm_source)
    if (meta.utm_medium)   params.set('utm_medium',   meta.utm_medium)
    if (meta.utm_campaign) params.set('utm_campaign', meta.utm_campaign)
    if (meta.utm_content)  params.set('utm_content',  meta.utm_content)
    if (meta.utm_term)     params.set('utm_term',     meta.utm_term)
    if (meta.partner_code) params.set('via',          meta.partner_code)

    if (!params.toString()) return

    document.querySelectorAll<HTMLAnchorElement>('a[href*="/signup"]').forEach(link => {
      try {
        const url = new URL(link.href)
        if (!url.hostname.endsWith('orbo.ru')) return
        params.forEach((value, key) => {
          if (!url.searchParams.has(key)) {
            url.searchParams.set(key, value)
          }
        })
        link.href = url.toString()
      } catch {
        // ignore malformed hrefs
      }
    })
  }, [])

  return null
}
