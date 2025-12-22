import type { Metadata } from 'next';
import '@/components/website/website.css';

export const metadata: Metadata = {
  title: {
    default: 'Orbo — CRM для групп и сообществ в мессенджерах',
    template: '%s | Orbo'
  },
  description: 'AI-аналитика сообществ, управление событиями, уведомления о негативе и неответах. Telegram, WhatsApp, VK. Всё в одном месте.',
  keywords: ['telegram crm', 'crm для сообществ', 'аналитика telegram', 'управление группами', 'события telegram', 'whatsapp crm'],
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: 'https://orbo.ru',
    title: 'Orbo — CRM для групп и сообществ в мессенджерах',
    description: 'AI-аналитика сообществ, управление событиями, уведомления о негативе и неответах.',
    siteName: 'Orbo',
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
    </div>
  );
}

