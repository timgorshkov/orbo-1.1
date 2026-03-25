import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Партнёрская программа Orbo — зарабатывайте на внедрении CRM для сообществ',
  description: 'До 50% от подписки или 4 000 ₽ за каждого клиента. Внедряйте Orbo — CRM участников и событий для Telegram и Max — своим клиентам и зарабатывайте.',
  keywords: ['партнёрская программа orbo', 'реферальная программа crm', 'партнёрство telegram crm', 'заработок на внедрении'],
  alternates: { canonical: '/partners' },
  openGraph: {
    title: 'Партнёрская программа Orbo',
    description: 'До 50% от подписки клиента. Внедряйте CRM для Telegram-сообществ и зарабатывайте.',
    url: '/partners',
    type: 'website',
  },
};

export default function PartnersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
