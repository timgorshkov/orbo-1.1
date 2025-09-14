import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ 
  subsets: ['latin', 'cyrillic'],
  display: 'swap', // Улучшает отображение шрифта
  variable: '--font-inter', // Добавляем CSS переменную для использования в tailwind
});

export const metadata: Metadata = {
  title: 'Orbo - Telegram Community Platform',
  description: 'Manage your Telegram communities efficiently with Orbo',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
    </head>
    <body className={`${inter.className} bg-slate-50`}>{children}</body>
  </html>
  );
}
