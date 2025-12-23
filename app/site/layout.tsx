import type { Metadata } from 'next';
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

