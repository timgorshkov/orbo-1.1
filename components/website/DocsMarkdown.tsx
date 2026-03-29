import { Marked } from 'marked';

const marked = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    // marked v12 passes positional args: (href, title, text)
    link(href: string, title: string | null | undefined, text: string) {
      if (href && href.startsWith('/')) {
        return `<a href="${href}">${text}</a>`;
      }
      return `<a href="${href ?? ''}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
  },
});

export function DocsMarkdown({ content }: { content: string }) {
  const html = marked.parse(content) as string;
  return (
    <div
      className="docs-markdown"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
