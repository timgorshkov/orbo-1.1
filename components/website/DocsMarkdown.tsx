'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';
import type { ComponentPropsWithoutRef } from 'react';

function CustomLink({ href, children, ...props }: ComponentPropsWithoutRef<'a'>) {
  if (href && href.startsWith('/')) {
    return (
      <Link href={href} {...props}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  );
}

export function DocsMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: CustomLink,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
