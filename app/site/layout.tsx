import type { Metadata } from 'next';
import '@/components/website/website.css';
import { HelpDeskWidget } from '@/components/support/helpdesk-widget';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  // metadataBase overrides the root layout's my.orbo.ru — critical for correct canonical URLs
  metadataBase: new URL('https://orbo.ru'),
  title: {
    default: 'CRM для Telegram-сообществ | Orbo',
    template: '%s | Orbo',
  },
  description: 'CRM участников и событий для Telegram-сообществ. MiniApp для регистрации и оплаты прямо в Telegram, автоматические напоминания, история участия.',
  keywords: ['telegram crm', 'crm для сообществ', 'аналитика telegram', 'управление участниками', 'события telegram', 'miniapp регистрация', 'telegram сообщество'],
  alternates: {
    canonical: 'https://orbo.ru',
  },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: 'https://orbo.ru',
    title: 'CRM для Telegram-сообществ | Orbo',
    description: 'MiniApp для регистрации на события, учёт участников и автоматические напоминания для Telegram-сообществ.',
    siteName: 'Orbo',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CRM для Telegram-сообществ | Orbo',
    description: 'MiniApp для регистрации на события, учёт участников и автоматические напоминания для Telegram-сообществ.',
  },
};

export default function WebsiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="website-root">
      {children}
      {/* Analytics (Yandex.Metrika, VK Pixel) are loaded via root app/layout.tsx */}
      <HelpDeskWidget />
    </div>
  );
}

