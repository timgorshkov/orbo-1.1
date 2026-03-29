'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getAllSections } from '@/lib/docs/content';

export function DocsSidebar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const sections = getAllSections();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    close();
  }, [pathname, close]);

  const currentSlug = pathname.replace('/docs/', '').replace('/docs', '');

  return (
    <>
      <aside className={`docs-sidebar${open ? ' docs-sidebar--open' : ''}`}>
        <div style={{ padding: '0 8px' }}>
          <Link
            href="/docs"
            className="docs-sidebar__link"
            style={{ fontWeight: 600, marginBottom: 12, display: 'block' }}
          >
            Документация
          </Link>
        </div>

        {sections.map((section) => (
          <div key={section.slug} className="docs-sidebar__section">
            <div className="docs-sidebar__section-title">{section.title}</div>
            {section.articles.map((article) => {
              const href = `/docs/${section.slug}/${article.slug}`;
              const isActive = currentSlug === `${section.slug}/${article.slug}`;
              return (
                <Link
                  key={article.slug}
                  href={href}
                  className={`docs-sidebar__link${isActive ? ' docs-sidebar__link--active' : ''}`}
                >
                  {article.title}
                </Link>
              );
            })}
          </div>
        ))}
      </aside>

      {open && (
        <div
          className="docs-sidebar-overlay docs-sidebar-overlay--visible"
          onClick={close}
        />
      )}

      <button
        className="docs-nav-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-label="Навигация документации"
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        )}
      </button>
    </>
  );
}
