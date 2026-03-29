import { marked } from 'marked';

// Configure marked for safe rendering
const renderer = new marked.Renderer();

// Open external links in new tab, keep internal links as-is
renderer.link = ({ href, text }: { href: string; text: string }) => {
  if (href && href.startsWith('/')) {
    return `<a href="${href}">${text}</a>`;
  }
  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
};

marked.use({ renderer, gfm: true, breaks: false });

export function DocsMarkdown({ content }: { content: string }) {
  const html = marked.parse(content) as string;
  return (
    <div
      className="docs-markdown"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
