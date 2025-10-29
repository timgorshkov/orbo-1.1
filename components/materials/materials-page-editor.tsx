'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Bold, Heading1, Heading2, Italic, Link as LinkIcon, Link2Off, List, Quote, Type, Video, Image as ImageIcon, ChevronLeft } from 'lucide-react';
import TurndownService from 'turndown';
import { marked } from 'marked';

export type MaterialsPageEditorProps = {
  orgId: string;
  pageId: string;
  initialTitle: string;
  initialContent: string;
  onUnsavedChanges?: (hasChanges: boolean) => void;
  saveRef?: React.MutableRefObject<(() => Promise<void>) | null>;
  onSave?: (pageId: string, newTitle: string) => void;
  onBackToList?: () => void;
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
    const title = node.dataset.title || '';
    const type = node.dataset.embed || 'embed';
    return `\n\n[${type}:${url}:${title}]\n\n`;
  }
});

function markdownToHtml(markdown: string): string {
  console.log('markdownToHtml - Input markdown:', markdown.substring(0, 300));
  
  let processed = markdown ?? '';
  const embeds: string[] = [];
  
  // Заменяем YouTube embed на placeholder (новый формат с заголовком)
  processed = processed.replace(/\[youtube:(https?:\/\/[^:]+):([^\]]*)\]/g, (_, url, title) => {
    console.log('Found YouTube embed:', url, 'Title:', title);
    const finalTitle = title && title.trim() !== '' ? title : 'YouTube видео';
    const videoId = extractYoutubeId(url);
    
    let iframeHtml = '';
    if (videoId) {
      iframeHtml = `<div class="relative w-full" style="padding-bottom: 56.25%;">
        <iframe 
          src="https://www.youtube.com/embed/${videoId}" 
          frameborder="0" 
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
          allowfullscreen
          class="absolute top-0 left-0 w-full h-full"
        ></iframe>
      </div>`;
    }
    
    const embedHtml = `<div class="my-4 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm" data-embed="youtube" data-url="${url}" data-title="${finalTitle}" contenteditable="false">
      ${iframeHtml}
      <div class="flex items-center justify-between px-4 py-3 text-sm text-neutral-700 bg-neutral-50">
        <span class="font-medium">${finalTitle}</span>
        <a href="${url}" target="_blank" class="text-blue-600 hover:underline">Открыть</a>
      </div>
    </div>`;
    embeds.push(embedHtml);
    return `<!--EMBED_${embeds.length - 1}-->`;
  });
  
  // Заменяем VK embed на placeholder (новый формат с заголовком)
  processed = processed.replace(/\[vk:(https?:\/\/[^:]+):([^\]]*)\]/g, (_, url, title) => {
    console.log('Found VK embed:', url, 'Title:', title);
    const finalTitle = title && title.trim() !== '' ? title : 'VK видео';
    const videoId = extractVkVideoId(url);
    console.log('VK video ID:', videoId);
    
    let iframeHtml = '';
    if (videoId) {
      iframeHtml = `<div class="relative w-full" style="padding-bottom: 56.25%;">
        <iframe 
          src="https://vk.com/video_ext.php?oid=${videoId.oid}&id=${videoId.id}&hd=2" 
          frameborder="0" 
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture; screen-wake-lock" 
          allowfullscreen
          class="absolute top-0 left-0 w-full h-full"
        ></iframe>
      </div>`;
    }
    
    const embedHtml = `<div class="my-4 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm" data-embed="vk" data-url="${url}" data-title="${finalTitle}" contenteditable="false">
      ${iframeHtml}
      <div class="flex items-center justify-between px-4 py-3 text-sm text-neutral-700 bg-neutral-50">
        <span class="font-medium">${finalTitle}</span>
        <a href="${url}" target="_blank" class="text-blue-600 hover:underline">Открыть</a>
      </div>
    </div>`;
    embeds.push(embedHtml);
    return `<!--EMBED_${embeds.length - 1}-->`;
  });
  
  console.log('Processed markdown with placeholders:', processed.substring(0, 300));
  console.log('Embeds count:', embeds.length);
  
  // Парсим markdown
  let html = marked.parse(processed, { breaks: true }) as string;
  console.log('Parsed HTML before embed restoration:', html.substring(0, 500));
  console.log('Looking for placeholders...');
  
  // Восстанавливаем embeds (ищем в любых тегах)
  embeds.forEach((embedHtml, index) => {
    const placeholder = `<!--EMBED_${index}-->`;
    console.log(`Restoring embed ${index}, searching for: "${placeholder}"`);
    console.log(`HTML contains placeholder: ${html.includes(placeholder)}`);
    console.log(`HTML contains in <p>: ${html.includes(`<p>${placeholder}</p>`)}`);
    
    // Заменяем comment placeholder
    const before = html.length;
    html = html.replace(new RegExp(`<!--EMBED_${index}-->`, 'g'), embedHtml);
    console.log(`After direct replace: ${html.length !== before ? 'SUCCESS' : 'NO MATCH'}`);
    
    // На всякий случай, если markdown обернул в теги
    html = html.replace(new RegExp(`<p><!--EMBED_${index}--></p>`, 'g'), embedHtml);
    
    // Проверяем, есть ли еще placeholder в HTML
    if (html.includes(placeholder)) {
      console.log(`WARNING: Placeholder ${index} still exists in HTML!`);
      console.log('HTML snippet:', html.substring(html.indexOf(placeholder) - 50, html.indexOf(placeholder) + 100));
    }
  });
  
  console.log('Final HTML:', html.substring(0, 500));
  
  return html;
}

export function MaterialsPageEditor({ orgId, pageId, initialTitle, initialContent, onUnsavedChanges, saveRef, onSave, onBackToList }: MaterialsPageEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [contentMd, setContentMd] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [toolbar, setToolbar] = useState<SelectionToolbarState>({ visible: false, top: 0, left: 0 });
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    console.log('=== Editor useEffect ===');
    console.log('pageId:', pageId);
    console.log('initialTitle:', initialTitle);
    console.log('initialContent:', initialContent);
    
    setTitle(initialTitle);
    setContentMd(initialContent);
    setHasUnsavedChanges(false);
    if (editorRef.current) {
      const html = markdownToHtml(initialContent);
      console.log('Setting editor HTML (full):', html);
      editorRef.current.innerHTML = html;
      console.log('Editor innerHTML after setting:', editorRef.current.innerHTML.substring(0, 500));
    }
  }, [initialTitle, initialContent, pageId]);

  useEffect(() => {
    const hasChanges = title !== initialTitle || contentMd !== initialContent;
    setHasUnsavedChanges(hasChanges);
    onUnsavedChanges?.(hasChanges);
  }, [title, contentMd, initialTitle, initialContent, onUnsavedChanges]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const synchronizeMarkdown = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    console.log('synchronizeMarkdown - HTML:', html.substring(0, 500));
    
    const markdown = turndown.turndown(html || '<p></p>');
    console.log('synchronizeMarkdown - Markdown:', markdown.substring(0, 500));
    
    setContentMd(markdown);
  }, []);

  const handleSave = useCallback(async () => {
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
      setHasUnsavedChanges(false);
      onUnsavedChanges?.(false);
      onSave?.(pageId, title);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  }, [orgId, pageId, title, contentMd, onUnsavedChanges, onSave]);

  useEffect(() => {
    if (saveRef) {
      saveRef.current = handleSave;
    }
  }, [handleSave, saveRef]);

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
      console.log('=== applyFormatting START ===');
      console.log('Action:', action);
      console.log('Editor exists:', !!editorRef.current);
      
      if (!editorRef.current) {
        console.log('ERROR: No editor ref');
        return;
      }
      
      // Сохраняем выделение
      const selection = window.getSelection();
      console.log('Selection:', selection);
      console.log('Range count:', selection?.rangeCount);
      
      if (!selection || selection.rangeCount === 0) {
        console.log('ERROR: No selection');
        return;
      }
      
      const range = selection.getRangeAt(0).cloneRange();
      console.log('Range:', range);
      console.log('Selected text:', range.toString());
      console.log('Range HTML:', range.cloneContents().textContent);
      
      // Фокусируемся на редакторе
      editorRef.current.focus();
      console.log('Editor focused');
      
      // Восстанавливаем выделение
      selection.removeAllRanges();
      selection.addRange(range);
      console.log('Selection restored');
      
      // Применяем форматирование
      let success = false;
      console.log('Applying command...');
      
      switch (action) {
        case 'bold':
          success = document.execCommand('bold', false, undefined);
          console.log('Bold command result:', success);
          break;
        case 'italic':
          success = document.execCommand('italic', false, undefined);
          console.log('Italic command result:', success);
          break;
        case 'heading1':
          success = document.execCommand('formatBlock', false, 'h1');
          console.log('H1 command result:', success);
          break;
        case 'heading2':
          success = document.execCommand('formatBlock', false, 'h2');
          console.log('H2 command result:', success);
          break;
        case 'list':
          success = document.execCommand('insertUnorderedList', false, undefined);
          console.log('List command result:', success);
          break;
        case 'quote':
          success = document.execCommand('formatBlock', false, 'blockquote');
          console.log('Quote command result:', success);
          break;
        case 'link': {
          const url = prompt('Введите URL ссылки');
          console.log('Link URL:', url);
          if (url) {
            success = document.execCommand('createLink', false, url);
            console.log('Link command result:', success);
          }
          break;
        }
      }
      
      console.log('Editor HTML after formatting:', editorRef.current.innerHTML.substring(0, 200));
      
      // Синхронизируем markdown
      setTimeout(() => {
        console.log('Synchronizing markdown...');
        synchronizeMarkdown();
        console.log('=== applyFormatting END ===');
      }, 50);
    },
    [synchronizeMarkdown]
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
      top: rect.top - 48,
      left: rect.left + rect.width / 2
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

  const handleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    // Проверяем, кликнули ли по ссылке с Ctrl/Cmd
    if (target.tagName === 'A' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      const href = target.getAttribute('href');
      if (href) {
        window.open(href, '_blank');
      }
    }
  }, []);

  const handleKeyDownGlobal = useCallback((event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && editorRef.current) {
      editorRef.current.classList.add('ctrl-pressed');
    }
  }, []);

  const handleKeyUpGlobal = useCallback((event: KeyboardEvent) => {
    if ((!event.ctrlKey && !event.metaKey) && editorRef.current) {
      editorRef.current.classList.remove('ctrl-pressed');
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDownGlobal);
    window.addEventListener('keyup', handleKeyUpGlobal);
    return () => {
      window.removeEventListener('keydown', handleKeyDownGlobal);
      window.removeEventListener('keyup', handleKeyUpGlobal);
    };
  }, [handleKeyDownGlobal, handleKeyUpGlobal]);

  const insertEmbed = useCallback(
    (type: 'youtube' | 'vk') => {
      console.log('=== insertEmbed START ===');
      console.log('Type:', type);
      
      if (!editorRef.current) {
        console.log('ERROR: No editor ref');
        return;
      }
      
      focusEditor();
      const url = prompt('Вставьте ссылку на видео');
      console.log('URL entered:', url);
      
      if (!url) {
        console.log('No URL, aborting');
        return;
      }

      let title = prompt('Введите заголовок видео');
      if (!title || title.trim() === '') {
        console.log('No title provided, using default');
        title = type === 'youtube' ? 'YouTube видео' : 'VK видео';
      }

      const container = document.createElement('div');
      container.className = 'my-4 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm';
      container.setAttribute('data-embed', type);
      container.setAttribute('data-url', url);
      container.setAttribute('data-title', title);
      container.contentEditable = 'false';

      if (type === 'youtube') {
        const videoId = extractYoutubeId(url);
        console.log('YouTube video ID:', videoId);
        
        if (videoId) {
          // Встраиваем YouTube iframe
          const iframeWrapper = document.createElement('div');
          iframeWrapper.className = 'relative w-full';
          iframeWrapper.style.paddingBottom = '56.25%'; // 16:9 aspect ratio
          iframeWrapper.innerHTML = `<iframe 
            src="https://www.youtube.com/embed/${videoId}" 
            frameborder="0" 
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
            allowfullscreen
            class="absolute top-0 left-0 w-full h-full"
          ></iframe>`;
          container.appendChild(iframeWrapper);
        }
        
        const overlay = document.createElement('div');
        overlay.className = 'flex items-center justify-between px-4 py-3 text-sm text-neutral-700 bg-neutral-50';
        overlay.innerHTML = `<span class="font-medium">${title}</span><a href="${url}" target="_blank" class="text-blue-600 hover:underline">Открыть</a>`;
        container.appendChild(overlay);
      } else {
        console.log('Creating VK embed...');
        const vkVideoId = extractVkVideoId(url);
        console.log('VK video ID:', vkVideoId);
        
        if (vkVideoId) {
          // Встраиваем VK iframe
          const iframeWrapper = document.createElement('div');
          iframeWrapper.className = 'relative w-full';
          iframeWrapper.style.paddingBottom = '56.25%'; // 16:9 aspect ratio
          iframeWrapper.innerHTML = `<iframe 
            src="https://vk.com/video_ext.php?oid=${vkVideoId.oid}&id=${vkVideoId.id}&hd=2" 
            frameborder="0" 
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture; screen-wake-lock" 
            allowfullscreen
            class="absolute top-0 left-0 w-full h-full"
          ></iframe>`;
          container.appendChild(iframeWrapper);
        }
        
        const overlay = document.createElement('div');
        overlay.className = 'flex items-center justify-between px-4 py-3 text-sm text-neutral-700 bg-neutral-50';
        overlay.innerHTML = `<span class="font-medium">${title}</span><a href="${url}" target="_blank" class="text-blue-600 hover:underline">Открыть</a>`;
        container.appendChild(overlay);
        console.log('VK embed added');
      }

      console.log('Container HTML:', container.outerHTML.substring(0, 300));

      const selection = window.getSelection();
      const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      if (range) {
        range.collapse(false);
        range.insertNode(container);
        range.setStartAfter(container);
        range.setEndAfter(container);
        selection?.removeAllRanges();
        selection?.addRange(range);
        console.log('Container inserted at selection');
      } else {
        editorRef.current.appendChild(container);
        console.log('Container appended to editor');
      }

      const spacer = document.createElement('p');
      spacer.innerHTML = '<br />';
      container.after(spacer);

      console.log('Editor HTML after insert:', editorRef.current.innerHTML.substring(0, 500));
      
      synchronizeMarkdown();
      console.log('=== insertEmbed END ===');
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
    <div className="relative h-full flex flex-col bg-white">
      {toolbar.visible && (
        <FloatingToolbar
          top={toolbar.top}
          left={toolbar.left}
          onFormat={applyFormatting}
          onHide={() => setToolbar(prev => ({ ...prev, visible: false }))}
        />
      )}
      {/* Мобильная версия header */}
      <div className="md:hidden sticky top-0 z-10 bg-white border-b border-neutral-200 px-4 py-3 flex items-center gap-3 shrink-0">
        {onBackToList && (
          <button
            onClick={() => {
              if (hasUnsavedChanges) {
                const confirmLeave = confirm('У вас есть несохранённые изменения. Сохранить перед выходом?');
                if (confirmLeave) {
                  handleSave().then(() => onBackToList());
                } else {
                  onBackToList();
                }
              } else {
                onBackToList();
              }
            }}
            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm">К списку</span>
          </button>
        )}
        <input
          type="text"
          value={title}
          onChange={event => setTitle(event.target.value)}
          placeholder="Название"
          className="flex-1 text-lg font-bold border-0 outline-none focus:outline-none bg-transparent min-w-0"
        />
        <Button 
          onClick={handleSave} 
          disabled={isSaving || !title.trim()}
          className="shrink-0"
          size="sm"
        >
          {isSaving ? 'Сохр...' : 'Сохранить'}
        </Button>
      </div>

      {/* Десктопная версия header */}
      <div className="hidden md:flex border-b border-neutral-200 px-6 py-6 items-center justify-between sticky top-0 bg-white z-10 shrink-0">
        <input
          type="text"
          value={title}
          onChange={event => setTitle(event.target.value)}
          placeholder="Название материала"
          className="flex-1 text-3xl font-bold border-0 outline-none focus:outline-none bg-transparent"
        />
        <div className="flex items-center gap-3 ml-4">
          {lastSaved && <span className="text-xs text-neutral-500">Сохранено в {lastSaved}</span>}
          <Button onClick={handleSave} disabled={isSaving || !title.trim()}>
            {isSaving ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-2 border-b border-neutral-100 bg-neutral-50 px-6 py-2 text-xs text-neutral-500 shrink-0">
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
      <div className="flex-1 min-h-0 overflow-y-auto">
        <style dangerouslySetInnerHTML={{__html: `
          .material-editor h1 {
            font-size: 2em;
            font-weight: bold;
            margin: 0.67em 0;
            line-height: 1.2;
          }
          .material-editor h2 {
            font-size: 1.5em;
            font-weight: bold;
            margin: 0.75em 0;
            line-height: 1.3;
          }
          .material-editor h3 {
            font-size: 1.17em;
            font-weight: bold;
            margin: 0.83em 0;
            line-height: 1.4;
          }
          .material-editor ul {
            list-style-type: disc;
            margin: 1em 0;
            padding-left: 2em;
          }
          .material-editor ol {
            list-style-type: decimal;
            margin: 1em 0;
            padding-left: 2em;
          }
          .material-editor li {
            margin: 0.25em 0;
          }
          .material-editor blockquote {
            border-left: 4px solid #e5e7eb;
            padding-left: 1em;
            margin: 1em 0;
            color: #6b7280;
            font-style: italic;
          }
          .material-editor p {
            margin: 0.5em 0;
          }
          .material-editor a {
            color: #2563eb;
            text-decoration: underline;
          }
          .material-editor a:hover {
            color: #1d4ed8;
            cursor: pointer;
          }
          /* Показываем курсор pointer при Ctrl/Cmd */
          .material-editor.ctrl-pressed a {
            cursor: pointer;
          }
        `}} />
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onClick={handleClick}
          className="material-editor min-h-[60vh] px-6 py-6 text-base leading-relaxed focus:outline-none"
        />
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
    { action: 'link', icon: <LinkIcon className="h-4 w-4" />, label: 'Ссылка' }
  ];

  return (
    <div
      className="fixed z-50 -translate-x-1/2 rounded-full border border-neutral-200 bg-white px-3 py-1 shadow-lg"
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

function extractVkVideoId(url: string): { oid: string; id: string } | null {
  const regex = /vk(?:video)?\.(?:com|ru)\/(?:video)?(-?\d+)_(\d+)/;
  const match = url.match(regex);
  return match ? { oid: match[1], id: match[2] } : null;
}

function getVideoTitle(url: string, type: 'youtube' | 'vk'): string {
  if (type === 'youtube') {
    const videoId = extractYoutubeId(url);
    return videoId ? `YouTube видео (${videoId})` : 'YouTube видео';
  } else {
    const videoId = extractVkVideoId(url);
    return videoId ? `VK видео (${videoId.oid}_${videoId.id})` : 'VK видео';
  }
}
