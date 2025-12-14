import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';

const inter = Inter({ 
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: 'Orbo - Управление Telegram-сообществом',
    template: '%s | Orbo'
  },
  description: 'CRM участников, материалы, события и дашборд для Telegram-сообществ. Интеграция за минуты. Freemium до 50 участников.',
  keywords: ['telegram', 'crm', 'community', 'сообщество', 'участники', 'события', 'qr-чекин', 'аналитика', 'база знаний'],
  authors: [{ name: 'Команда Orbo' }],
  creator: 'Orbo',
  publisher: 'Orbo',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL('https://app.orbo.ru'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: 'https://app.orbo.ru',
    title: 'Orbo - Управление Telegram-сообществом',
    description: 'CRM участников, материалы, события и дашборд для Telegram-сообществ',
    siteName: 'Orbo',
    images: [
      {
        url: '/orbo-logo-2-no-bg.png',
        width: 1200,
        height: 630,
        alt: 'Orbo - Управление Telegram-сообществом',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Orbo - Управление Telegram-сообществом',
    description: 'CRM участников, материалы, события и дашборд для Telegram-сообществ',
    images: ['/orbo-logo-2-no-bg.png'],
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/apple-touch-icon.png' },
    ],
  },
  manifest: '/site.webmanifest',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <link rel="icon" href="/icon.svg" type="image/svg+xml" />
      <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    </head>
    <body className={`${inter.className} bg-slate-50`}>
      {children}
      <SpeedInsights />
    </body>
  </html>
  );
}
