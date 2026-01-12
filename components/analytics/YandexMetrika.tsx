'use client';

import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, Suspense } from 'react';

// Yandex.Metrika counter ID (same for orbo.ru and my.orbo.ru for cross-domain tracking)
export const YM_COUNTER_ID = 104139201;

// Track sent goals to prevent duplicates in the same session
const sentGoals = new Set<string>();

// VK Pixel ID for dataLayer integration
const VK_PIXEL_ID = '3733096';

// Declare types for TypeScript
declare global {
  interface Window {
    ym?: (counterId: number, action: string, ...args: unknown[]) => void;
    dataLayer?: Array<Record<string, unknown>>;
    _tmr?: Array<Record<string, unknown>>;
  }
}

/**
 * Send goal to both Yandex.Metrika and VK Pixel (via dataLayer)
 * @param goalName - Name of the goal (e.g., 'signup_start', 'registration_complete')
 * @param params - Optional parameters to send with the goal
 * @param options - Options: { once: true } prevents sending the same goal twice in a session
 */
export function ymGoal(
  goalName: string, 
  params?: Record<string, unknown>,
  options?: { once?: boolean }
) {
  if (typeof window === 'undefined') return;
  
  // If once=true, check if already sent
  const goalKey = options?.once ? `${goalName}:once` : null;
  if (goalKey && sentGoals.has(goalKey)) {
    console.log(`[Analytics] Goal already sent (once), skipping: ${goalName}`);
    return;
  }
  
  // Mark as sent if once=true
  if (goalKey) {
    sentGoals.add(goalKey);
  }
  
  // === Yandex.Metrika ===
  const sendYmGoal = (attempt: number = 0) => {
    if (window.ym) {
      window.ym(YM_COUNTER_ID, 'reachGoal', goalName, params);
      console.log(`[YM] Goal reached: ${goalName}`, params);
    } else if (attempt < 10) {
      setTimeout(() => sendYmGoal(attempt + 1), 500);
    } else {
      console.warn(`[YM] Failed to send goal after 10 attempts: ${goalName}`);
    }
  };
  sendYmGoal();
  
  // === VK Pixel (Top.Mail.Ru) via dataLayer ===
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: goalName,
    ...params,
  });
  console.log(`[VK dataLayer] Event pushed: ${goalName}`, params);
  
  // === VK Pixel direct goal ===
  window._tmr = window._tmr || [];
  window._tmr.push({ 
    type: 'reachGoal', 
    id: VK_PIXEL_ID, 
    goal: goalName 
  });
}

/**
 * Hook for sending a goal only once when component mounts
 * Prevents duplicate sends from React StrictMode or re-renders
 */
export function useYmGoalOnce(goalName: string, params?: Record<string, unknown>) {
  const hasSent = useRef(false);
  
  useEffect(() => {
    if (!hasSent.current) {
      hasSent.current = true;
      ymGoal(goalName, params, { once: true });
    }
  }, [goalName]); // Only goalName as dependency, params are captured at first call
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
