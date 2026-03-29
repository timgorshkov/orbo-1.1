import type { Metadata } from 'next';
import { Header, Footer } from '@/components/website';
import { DocsSidebar } from '@/components/website/DocsSidebar';

export const metadata: Metadata = {
  title: {
    template: '%s — Документация Orbo',
    default: 'Документация Orbo',
  },
  description: 'Документация по использованию Orbo — CRM участников и событий для сообществ в Telegram и Max.',
  alternates: {
    canonical: 'https://orbo.ru/docs',
  },
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header transparent={false} />
      <div className="docs-layout" style={{ paddingTop: '80px' }}>
        <DocsSidebar />
        <main className="docs-content">
          {children}
        </main>
      </div>
      <Footer />
    </>
  );
}
