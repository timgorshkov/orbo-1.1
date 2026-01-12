import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import '../globals.css';

// Load Inter font (same as main app)
const inter = Inter({ 
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Orbo Events',
  description: 'Регистрация на события через Telegram',
  robots: 'noindex, nofollow', // Don't index MiniApp pages
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function TelegramAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Telegram WebApp script loaded in page */}
        <meta name="format-detection" content="telephone=no" />
        <meta name="color-scheme" content="light dark" />
      </head>
      <body className={`${inter.className} bg-white text-gray-900 antialiased`} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}

