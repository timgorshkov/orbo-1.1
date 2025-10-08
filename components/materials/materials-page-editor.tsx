'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Bold, Heading1, Heading2, Italic, Link as LinkIcon, Link2Off, List, Quote, Type, Video, Image as ImageIcon } from 'lucide-react';
import TurndownService from 'turndown';
import { marked } from 'marked';

export type MaterialsPageEditorProps = {
  orgId: string;
  pageId: string;
  initialTitle: string;
  initialContent: string;
};

type FormattingAction = 'bold' | 'italic' | 'heading1' | 'heading2' | 'list' | 'quote' | 'link' | 'unlink';

type SelectionToolbarState = {
  visible: boolean;
  top: number;
  left: number;
};

const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', emDelimiter: '*' });

turndown.addRule('embeds', {
  filter: (node: TurndownService.Node) => {
    return node instanceof HTMLElement && Boolean(node.dataset?.embed);
  },
  replacement: (_content, node: any) => {
    const url = node.dataset.url || '';
    const type = node.dataset.embed || 'embed';
    return `![${type}](${url})`;
  }
});

function markdownToHtml(markdown: string): string {
  return marked.parse(markdown ?? '', { breaks: true }) as string;
}

export function MaterialsPageEditor({ orgId, pageId, initialTitle, initialContent }: MaterialsPageEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [contentMd, setContentMd] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [toolbar, setToolbar] = useState<SelectionToolbarState>({ visible: false, top: 0, left: 0 });
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setTitle(initialTitle);
    setContentMd(initialContent);
    if (editorRef.current) {
      editorRef.current.innerHTML = markdownToHtml(initialContent);
    }
  }, [initialTitle, initialContent]);

  const synchronizeMarkdown = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    const markdown = turndown.turndown(html || '<p></p>');
    setContentMd(markdown);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/materials/${pageId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orgId,
          title,
          contentMd
        })
      });

      if (!response.ok) {
        throw new Error('Не удалось сохранить страницу');
      }

      setLastSaved(new Date().toLocaleTimeString('ru-RU'));
    } catch (error) {
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const focusEditor = useCallback(() => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      const range = document.createRange();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, []);

  const applyFormatting = useCallback(
    (action: FormattingAction) => {
      if (!editorRef.current) return;
      focusEditor();
      switch (action) {
        case 'bold':
          document.execCommand('bold');
          break;
        case 'italic':
          document.execCommand('italic');
          break;
        case 'heading1':
          document.execCommand('formatBlock', false, 'H1');
          break;
        case 'heading2':
          document.execCommand('formatBlock', false, 'H2');
          break;
        case 'list':
          document.execCommand('insertUnorderedList');
          break;
        case 'quote':
          document.execCommand('formatBlock', false, 'BLOCKQUOTE');
          break;
        case 'link': {
          const url = prompt('Введите URL ссылки');
          if (url) {
            document.execCommand('createLink', false, url);
          }
          break;
        }
        case 'unlink':
          document.execCommand('unlink');
          break;
      }
      synchronizeMarkdown();
    },
    [focusEditor, synchronizeMarkdown]
  );

  const handleSelectionChange = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setToolbar(prev => ({ ...prev, visible: false }));
      return;
    }

    const range = selection.getRangeAt(0);
    if (!editorRef.current || !editorRef.current.contains(range.startContainer) || selection.isCollapsed) {
      setToolbar(prev => ({ ...prev, visible: false }));
      return;
    }

    const rect = range.getBoundingClientRect();
    setToolbar({
      visible: true,
      top: rect.top + window.scrollY - 48,
      left: rect.left + window.scrollX + rect.width / 2
    });
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [handleSelectionChange]);

  const handleInput = useCallback(() => {
    synchronizeMarkdown();
  }, [synchronizeMarkdown]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Tab') {
        event.preventDefault();
        document.execCommand('insertText', false, '    ');
        synchronizeMarkdown();
      }
    },
    [synchronizeMarkdown]
  );

  const insertEmbed = useCallback(
    (type: 'youtube' | 'vk') => {
      if (!editorRef.current) return;
      focusEditor();
      const url = prompt('Вставьте ссылку на видео');
      if (!url) return;

      const container = document.createElement('div');
      container.className = 'my-4 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50';
      container.setAttribute('data-embed', type);
      container.setAttribute('data-url', url);
      container.contentEditable = 'false';

      if (type === 'youtube') {
        const videoId = extractYoutubeId(url);
        const thumb = document.createElement('img');
        thumb.src = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '';
        thumb.alt = 'YouTube видео';
        thumb.className = 'block h-48 w-full object-cover';
        container.appendChild(thumb);
        const overlay = document.createElement('div');
        overlay.className = 'flex items-center justify-between px-4 py-3 text-sm text-neutral-700';
        overlay.innerHTML = `<span>Видео YouTube</span><a href="${url}" target="_blank" class="text-blue-600">Открыть</a>`;
        container.appendChild(overlay);
      } else {
        const body = document.createElement('div');
        body.className = 'flex items-center justify-between px-4 py-3 text-sm text-neutral-700';
        body.innerHTML = `<span>Видео VK</span><a href="${url}" target="_blank" class="text-blue-600">Открыть</a>`;
        container.appendChild(body);
      }

      const selection = window.getSelection();
      const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      if (range) {
        range.collapse(false);
        range.insertNode(container);
        range.setStartAfter(container);
        range.setEndAfter(container);
        selection?.removeAllRanges();
        selection?.addRange(range);
      } else {
        editorRef.current.appendChild(container);
      }

      const spacer = document.createElement('p');
      spacer.innerHTML = '<br />';
      container.after(spacer);

      synchronizeMarkdown();
    },
    [focusEditor, synchronizeMarkdown]
  );

  const insertParagraph = useCallback(() => {
    focusEditor();
    if (!editorRef.current) return;
    const p = document.createElement('p');
    p.textContent = 'Новый блок';
    editorRef.current.appendChild(p);
    synchronizeMarkdown();
  }, [focusEditor, synchronizeMarkdown]);

  return (
    <div className="relative h-full overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      {toolbar.visible && (
        <FloatingToolbar
          top={toolbar.top}
          left={toolbar.left}
          onFormat={applyFormatting}
          onHide={() => setToolbar(prev => ({ ...prev, visible: false }))}
        />
      )}
      <div className="border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
        <Input
          value={title}
          onChange={event => setTitle(event.target.value)}
          placeholder="Название материала"
          className="text-lg font-semibold border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
        />
        <div className="flex items-center gap-3">
          {lastSaved && <span className="text-xs text-neutral-500">Сохранено в {lastSaved}</span>}
          <Button onClick={handleSave} disabled={isSaving || !title.trim()}>
            {isSaving ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-2 border-b border-neutral-100 bg-neutral-50 px-6 py-2 text-xs text-neutral-500">
        <button
          className="flex items-center gap-1 rounded border border-dashed border-neutral-300 px-2 py-1 hover:border-neutral-500"
          onClick={insertParagraph}
        >
          <Type className="h-4 w-4" />
          Новый блок
        </button>
        <button
          className="flex items-center gap-1 rounded border border-dashed border-neutral-300 px-2 py-1 hover:border-neutral-500"
          onClick={() => insertEmbed('youtube')}
        >
          <Video className="h-4 w-4" />
          Видео YouTube
        </button>
        <button
          className="flex items-center gap-1 rounded border border-dashed border-neutral-300 px-2 py-1 hover:border-neutral-500"
          onClick={() => insertEmbed('vk')}
        >
          <ImageIcon className="h-4 w-4" />
          Видео VK
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-6 space-y-6">
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            className="min-h-[60vh] rounded-xl border border-neutral-200 bg-white px-6 py-5 text-base leading-relaxed shadow-sm focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}

type FloatingToolbarProps = {
  top: number;
  left: number;
  onFormat: (action: FormattingAction) => void;
  onHide: () => void;
};

function FloatingToolbar({ top, left, onFormat, onHide }: FloatingToolbarProps) {
  const buttons: Array<{ action: FormattingAction; icon: React.ReactNode; label: string }> = [
    { action: 'bold', icon: <Bold className="h-4 w-4" />, label: 'Жирный' },
    { action: 'italic', icon: <Italic className="h-4 w-4" />, label: 'Курсив' },
    { action: 'heading1', icon: <Heading1 className="h-4 w-4" />, label: 'Заголовок 1' },
    { action: 'heading2', icon: <Heading2 className="h-4 w-4" />, label: 'Заголовок 2' },
    { action: 'list', icon: <List className="h-4 w-4" />, label: 'Маркированный список' },
    { action: 'quote', icon: <Quote className="h-4 w-4" />, label: 'Цитата' },
    { action: 'link', icon: <LinkIcon className="h-4 w-4" />, label: 'Ссылка' },
    { action: 'unlink', icon: <Link2Off className="h-4 w-4" />, label: 'Убрать ссылку' }
  ];

  return (
    <div
      className="absolute z-20 -translate-x-1/2 rounded-full border border-neutral-200 bg-white px-3 py-1 shadow-lg"
      style={{ top, left }}
      onMouseDown={event => event.preventDefault()}
    >
      <div className="flex items-center gap-1">
        {buttons.map(button => (
          <button
            key={button.action}
            type="button"
            className="h-8 w-8 rounded-full text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
            onClick={() => onFormat(button.action)}
            title={button.label}
          >
            {button.icon}
          </button>
        ))}
        <button
          type="button"
          className="h-8 w-8 rounded-full text-neutral-400 hover:text-neutral-700"
          onClick={onHide}
          title="Закрыть"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function extractYoutubeId(url: string): string | null {
  const regex = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}
