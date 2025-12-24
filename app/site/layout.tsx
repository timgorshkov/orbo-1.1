import type { Metadata } from 'next';
import Script from 'next/script';
import '@/components/website/website.css';

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
    </div>
  );
}

