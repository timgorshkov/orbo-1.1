import type { Metadata } from 'next';
import Script from 'next/script';
import '@/components/website/website.css';

// VK Pixel ID
const VK_PIXEL_ID = '3733096';

export const metadata: Metadata = {
  title: {
    default: 'Orbo — CRM для групп и сообществ в мессенджерах',
    template: '%s | Orbo'
  },
  description: 'CRM для Telegram, WhatsApp и Max. AI-аналитика участников, события с регистрацией и оплатой, уведомления о негативе и неответах.',
  keywords: ['telegram crm', 'crm для сообществ', 'аналитика telegram', 'управление группами', 'события telegram', 'whatsapp crm', 'max messenger'],
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: 'https://orbo.ru',
    title: 'Orbo — CRM для групп и сообществ в мессенджерах',
    description: 'CRM для Telegram, WhatsApp и Max. AI-аналитика участников, события с регистрацией и оплатой, уведомления о негативе.',
    siteName: 'Orbo',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Orbo — CRM для групп и сообществ в мессенджерах',
    description: 'CRM для Telegram, WhatsApp и Max. AI-аналитика участников, события с регистрацией и оплатой, уведомления о негативе.',
  },
};

// Yandex.Metrika counter ID
const YM_COUNTER_ID = 104139201;

export default function WebsiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="website-root">
      {children}
      
      {/* Yandex.Metrika counter */}
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
              ssr: true,
              webvisor: true,
              clickmap: true,
              ecommerce: 'dataLayer',
              accurateTrackBounce: true,
              trackLinks: true
            });
          `,
        }}
      />
      <noscript>
        <div>
          <img 
            src={`https://mc.yandex.ru/watch/${YM_COUNTER_ID}`} 
            style={{ position: 'absolute', left: '-9999px' }} 
            alt="" 
          />
        </div>
      </noscript>
      
      {/* DataLayer initialization */}
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
      <noscript>
        <div>
          <img 
            src={`https://top-fwz1.mail.ru/counter?id=${VK_PIXEL_ID};js=na`} 
            style={{ position: 'absolute', left: '-9999px' }} 
            alt="Top.Mail.Ru" 
          />
        </div>
      </noscript>
    </div>
  );
}

