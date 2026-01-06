'use client';

import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, Suspense } from 'react';

// Yandex.Metrika counter ID (same for orbo.ru and my.orbo.ru for cross-domain tracking)
export const YM_COUNTER_ID = 104139201;

// Declare ym function type for TypeScript
declare global {
  interface Window {
    ym?: (counterId: number, action: string, ...args: unknown[]) => void;
  }
}

/**
 * Send Yandex.Metrika goal/event
 * @param goalName - Name of the goal (e.g., 'signup_start', 'signup_email_sent')
 * @param params - Optional parameters to send with the goal
 */
export function ymGoal(goalName: string, params?: Record<string, unknown>) {
  if (typeof window !== 'undefined' && window.ym) {
    window.ym(YM_COUNTER_ID, 'reachGoal', goalName, params);
    console.log(`[YM] Goal reached: ${goalName}`, params);
  }
}

/**
 * Send Yandex.Metrika page hit (for SPA navigation)
 * @param url - URL of the page
 * @param options - Optional hit options
 */
export function ymHit(url: string, options?: { title?: string; referer?: string }) {
  if (typeof window !== 'undefined' && window.ym) {
    window.ym(YM_COUNTER_ID, 'hit', url, options);
  }
}

/**
 * Set user parameters in Yandex.Metrika
 * @param params - User parameters (e.g., { userId: '123', plan: 'free' })
 */
export function ymUserParams(params: Record<string, unknown>) {
  if (typeof window !== 'undefined' && window.ym) {
    window.ym(YM_COUNTER_ID, 'userParams', params);
  }
}

// Component to track route changes (requires Suspense)
function RouteChangeTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Track page view on route change (for SPA navigation)
    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');
    ymHit(url);
  }, [pathname, searchParams]);

  return null;
}

/**
 * Yandex.Metrika component for Next.js App Router
 * Add this to your root layout to enable tracking across all pages
 * 
 * Features:
 * - Cross-domain tracking (orbo.ru <-> my.orbo.ru)
 * - SPA route change tracking
 * - Webvisor, clickmap, scroll tracking
 */
export function YandexMetrika() {
  return (
    <>
      {/* Route change tracker */}
      <Suspense fallback={null}>
        <RouteChangeTracker />
      </Suspense>

      {/* Yandex.Metrika counter script */}
      <Script
        id="yandex-metrika"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            (function(m,e,t,r,i,k,a){
              m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
              m[i].l=1*new Date();
              for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
              k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
            })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=${YM_COUNTER_ID}', 'ym');

            ym(${YM_COUNTER_ID}, 'init', {
              clickmap: true,
              trackLinks: true,
              accurateTrackBounce: true,
              webvisor: true,
              trackHash: true,
              ecommerce: 'dataLayer',
              // Cross-domain tracking for orbo.ru <-> my.orbo.ru
              triggerEvent: true
            });
          `,
        }}
      />
      
      {/* Noscript fallback */}
      <noscript>
        <div>
          <img 
            src={`https://mc.yandex.ru/watch/${YM_COUNTER_ID}`} 
            style={{ position: 'absolute', left: '-9999px' }} 
            alt="" 
          />
        </div>
      </noscript>
    </>
  );
}

export default YandexMetrika;
