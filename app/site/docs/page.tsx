import Link from 'next/link';
import { getAllSections } from '@/lib/docs/content';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Документация',
  description: 'Полная документация по использованию Orbo — CRM для сообществ в Telegram и Max. Быстрый старт, настройка, мероприятия, заявки, участники.',
};

export default function DocsIndexPage() {
  const sections = getAllSections();

  return (
    <>
      <h1>Документация Orbo</h1>
      <p style={{ fontSize: '16px', color: '#64748b', marginBottom: '32px', lineHeight: 1.6 }}>
        CRM участников, событий и управление сообществами в Telegram и Max.
        Выберите раздел или начните с одного из быстрых стартов.
      </p>

      <div className="docs-index">
        {sections.map((section) => (
          <Link
            key={section.slug}
            href={`/docs/${section.slug}/${section.articles[0]?.slug || ''}`}
            className="docs-index__card"
          >
            <h2 className="docs-index__card-title">{section.title}</h2>
            <ul className="docs-index__card-list">
              {section.articles.map((article) => (
                <li key={article.slug}>{article.title}</li>
              ))}
            </ul>
          </Link>
        ))}
      </div>
    </>
  );
}
