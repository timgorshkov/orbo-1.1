import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getArticleByFullSlug, getAllArticleSlugs } from '@/lib/docs/content';
import { DocsMarkdown } from '@/components/website/DocsMarkdown';
import type { Metadata } from 'next';

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

export function generateStaticParams() {
  return getAllArticleSlugs().map((fullSlug) => ({
    slug: fullSlug.split('/'),
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const fullSlug = slug.join('/');
  const result = getArticleByFullSlug(fullSlug);
  if (!result) return { title: 'Не найдено' };

  return {
    title: result.article.title,
    description: `${result.article.title} — документация Orbo. ${result.section.title}.`,
  };
}

export default async function DocsArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const fullSlug = slug.join('/');
  const result = getArticleByFullSlug(fullSlug);

  if (!result) {
    notFound();
  }

  const { section, article, prev, next } = result;

  return (
    <>
      <nav className="docs-breadcrumb">
        <Link href="/docs">Документация</Link>
        <span className="docs-breadcrumb__sep"> / </span>
        <Link href={`/docs/${section.slug}/${section.articles[0]?.slug || ''}`}>
          {section.title}
        </Link>
        <span className="docs-breadcrumb__sep"> / </span>
        <span>{article.title}</span>
      </nav>

      <DocsMarkdown content={article.content} />

      <nav className="docs-prev-next">
        {prev ? (
          <Link href={`/docs/${prev.section}/${prev.slug}`} className="docs-prev-next__link">
            <span className="docs-prev-next__label">← Назад</span>
            <span className="docs-prev-next__title">{prev.title}</span>
          </Link>
        ) : (
          <div />
        )}
        {next ? (
          <Link href={`/docs/${next.section}/${next.slug}`} className="docs-prev-next__link docs-prev-next__link--next">
            <span className="docs-prev-next__label">Далее →</span>
            <span className="docs-prev-next__title">{next.title}</span>
          </Link>
        ) : (
          <div />
        )}
      </nav>
    </>
  );
}
