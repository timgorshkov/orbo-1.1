import type { Metadata } from 'next';
import '@/components/website/website.css';
import { HelpDeskWidget } from '@/components/support/helpdesk-widget';

export const metadata: Metadata = {
  metadataBase: new URL('https://orbo.ru'),
  title: {
    default: 'CRM для групп и сообществ | Orbo',
    template: '%s | Orbo',
  },
  description: 'CRM участников для сообществ в Telegram и Max. Профили с AI-анализом интересов, события с MiniApp, заявки на вступление. Данные в России.',
  keywords: ['crm для сообществ', 'crm для групп', 'telegram crm', 'max crm', 'управление участниками', 'события telegram', 'miniapp регистрация', 'сообщество crm'],
  alternates: {
    canonical: 'https://orbo.ru',
  },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: 'https://orbo.ru',
    title: 'CRM для групп и сообществ | Orbo',
    description: 'Профили участников с AI-анализом, события с MiniApp, заявки. Telegram и Max. Данные в России.',
    siteName: 'Orbo',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CRM для групп и сообществ | Orbo',
    description: 'Профили участников с AI-анализом, события с MiniApp, заявки. Telegram и Max. Данные в России.',
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

