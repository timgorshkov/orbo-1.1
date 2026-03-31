'use client'

import { useEffect } from 'react'
import { getRegistrationMeta } from '@/lib/client/registration-meta'

/**
 * Intercepts clicks on signup links and appends _rm (base64-encoded registration meta)
 * to the URL at click time — not at mount time.
 *
 * Why click-time enrichment instead of href patching on mount:
 *   useEffect fires after paint. On slow mobile devices the user can click the link
 *   before the effect runs, or the page may have been loaded from browser cache before
 *   the current deploy, leaving the old JS without this enricher. Click interception
 *   is synchronous and always catches the navigation regardless of when the component mounts.
 *
 * Why _rm instead of individual UTM params:
 *   localStorage is domain-scoped — orbo.ru and my.orbo.ru have separate stores.
 *   Encoding the full meta preserves the real external referrer and first landing page
 *   that would otherwise be lost when crossing to my.orbo.ru.
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
        if (!meta || Object.keys(meta).length === 0) return

        const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(meta))))
        url.searchParams.set('_rm', encoded)

        e.preventDefault()
        window.location.href = url.toString()
      } catch {
        // ignore — let the original navigation proceed
      }
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  return null
}
