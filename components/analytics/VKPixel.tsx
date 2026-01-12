'use client';

import Script from 'next/script';

// VK Pixel (Top.Mail.Ru) ID
export const VK_PIXEL_ID = '3733096';

// Declare types for TypeScript
declare global {
  interface Window {
    _tmr?: Array<Record<string, unknown>>;
    dataLayer?: Array<Record<string, unknown>>;
  }
}

/**
 * Push event to dataLayer for VK Pixel tracking
 * @param eventName - Name of the event (e.g., 'registration', 'purchase')
 * @param eventData - Optional event data
 */
export function vkEvent(eventName: string, eventData?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  
  // Initialize dataLayer if not exists
  window.dataLayer = window.dataLayer || [];
  
  // Push event to dataLayer
  window.dataLayer.push({
    event: eventName,
    ...eventData,
  });
  
  console.log(`[VK Pixel] Event pushed to dataLayer: ${eventName}`, eventData);
}

/**
 * Push goal to VK Pixel (_tmr)
 * @param goalName - Name of the goal
 */
export function vkGoal(goalName: string) {
  if (typeof window === 'undefined') return;
  
  window._tmr = window._tmr || [];
  window._tmr.push({ 
    type: 'reachGoal', 
    id: VK_PIXEL_ID, 
    goal: goalName 
  });
  
  console.log(`[VK Pixel] Goal reached: ${goalName}`);
}

/**
 * VK Pixel (Top.Mail.Ru) component for Next.js App Router
 * Add this to your root layout to enable VK tracking
 */
export function VKPixel() {
  return (
    <>
      {/* Initialize dataLayer */}
      <Script
        id="datalayer-init"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{
          __html: `window.dataLayer = window.dataLayer || [];`,
        }}
      />
      
      {/* Top.Mail.Ru counter (VK Pixel) */}
      <Script
        id="vk-pixel"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            var _tmr = window._tmr || (window._tmr = []);
            _tmr.push({id: "${VK_PIXEL_ID}", type: "pageView", start: (new Date()).getTime()});
            (function (d, w, id) {
              if (d.getElementById(id)) return;
              var ts = d.createElement("script"); ts.type = "text/javascript"; ts.async = true; ts.id = id;
              ts.src = "https://top-fwz1.mail.ru/js/code.js";
              var f = function () {var s = d.getElementsByTagName("script")[0]; s.parentNode.insertBefore(ts, s);};
              if (w.opera == "[object Opera]") { d.addEventListener("DOMContentLoaded", f, false); } else { f(); }
            })(document, window, "tmr-code");
          `,
        }}
      />
      
      {/* Noscript fallback */}
      <noscript>
        <div>
          <img 
            src={`https://top-fwz1.mail.ru/counter?id=${VK_PIXEL_ID};js=na`} 
            style={{ position: 'absolute', left: '-9999px' }} 
            alt="Top.Mail.Ru" 
          />
        </div>
      </noscript>
    </>
  );
}

export default VKPixel;
