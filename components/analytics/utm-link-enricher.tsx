'use client'

import { useEffect } from 'react'
import { getRegistrationMeta } from '@/lib/client/registration-meta'

/**
 * Encodes the full registration meta captured on orbo.ru into signup links
 * as a base64 `_rm` param.
 *
 * Why _rm instead of individual UTM params:
 *   localStorage is domain-scoped — orbo.ru and my.orbo.ru have separate stores.
 *   Passing individual UTM params doesn't transfer `landing_page` and `referrer_url`,
 *   so my.orbo.ru would record /signup as the landing page and orbo.ru as the referrer.
 *   Encoding the full meta preserves the real external referrer and first landing page.
 */
export function UTMLinkEnricher() {
  useEffect(() => {
    const meta = getRegistrationMeta()
    if (!meta || Object.keys(meta).length === 0) return

    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(meta))))

    document.querySelectorAll<HTMLAnchorElement>('a[href*="/signup"]').forEach(link => {
      try {
        const url = new URL(link.href)
        if (!url.hostname.endsWith('orbo.ru')) return
        url.searchParams.set('_rm', encoded)
        link.href = url.toString()
      } catch {
        // ignore malformed hrefs
      }
    })
  }, [])

  return null
}
