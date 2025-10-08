'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MaterialTreeNode } from '@/lib/server/materials/service';
import { MaterialsTree } from './materials-tree';
import { MaterialsEditorPlaceholder } from './materials-editor-placeholder';
import { MaterialsPageEditor } from './materials-page-editor';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Search, Sparkles, Loader2 } from 'lucide-react';

export type MaterialsPageViewerProps = {
  orgId: string;
  initialTree: MaterialTreeNode[];
  orgName?: string;
  orgLogoUrl?: string | null;
  readOnly?: boolean;
};

type PageState = {
  id: string;
  title: string;
  contentMd: string;
};

export function MaterialsPageViewer({
  orgId,
  initialTree,
  orgName,
  orgLogoUrl,
  readOnly = false
}: MaterialsPageViewerProps) {
  const [tree, setTree] = useState<MaterialTreeNode[]>(initialTree);
  const [selectedId, setSelectedId] = useState<string | null>(() => firstPageId(initialTree));
  const [page, setPage] = useState<PageState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<{ page_id: string; title: string }>>([]);
  const [isSearching, setIsSearching] = useState(false);

  const flattenedTree = useMemo(() => flattenTree(tree), [tree]);

  const handleSelect = useCallback((id: string | null) => {
    setSelectedId(id);
    setIsSearchOpen(false);
  }, []);

  const loadPage = useCallback(async (pageId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/materials/${pageId}?orgId=${orgId}`);
      if (!response.ok) {
        throw new Error('Не удалось загрузить страницу');
      }
      const { page } = await response.json();
      setPage({ id: page.id, title: page.title, contentMd: page.content_md ?? '' });
    } catch (error) {
      console.error(error);
      setPage(null);
    } finally {
      setIsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (selectedId) {
      loadPage(selectedId);
    } else {
      setPage(null);
    }
  }, [selectedId, loadPage]);

  useEffect(() => {
    if (!searchValue.trim()) {
      setSearchResults([]);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        setIsSearching(true);
        const response = await fetch(`/api/materials/search?orgId=${orgId}&q=${encodeURIComponent(searchValue)}`, {
          signal: controller.signal
        });
        if (!response.ok) throw new Error('Search failed');
        const payload = await response.json();
        setSearchResults(payload.results ?? []);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          console.error('Search error', error);
        }
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [orgId, searchValue]);

  return (
    <div className="flex h-full">
      <aside className="w-72 shrink-0 border-r border-neutral-200 bg-white">
        <div className="px-4 py-4 border-b border-neutral-200 flex items-center gap-3">
          {orgLogoUrl ? (
            <img src={orgLogoUrl} alt={orgName ?? 'Организация'} className="h-10 w-10 rounded-lg object-cover" />
          ) : (
            <div className="h-10 w-10 rounded-lg bg-neutral-200 flex items-center justify-center text-neutral-600 font-semibold">
              {(orgName ?? 'OR')[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <div className="text-sm font-semibold text-neutral-900">{orgName ?? 'Организация'}</div>
            <div className="text-xs text-neutral-500">Раздел «Материалы»</div>
          </div>
        </div>
        <div className="p-3">
          <MaterialsTree
            orgId={orgId}
            initialTree={tree}
            selectedId={selectedId}
            onSelect={handleSelect}
            onTreeChange={setTree}
          />
        </div>
      </aside>
      <main className="flex-1 overflow-hidden bg-neutral-50">
        <div className="h-full p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-neutral-900">Материалы</h1>
              <p className="text-sm text-neutral-500">Быстрый переход по страницам и поиск по названию.</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <Input
                  value={searchValue}
                  onChange={event => setSearchValue(event.target.value)}
                  onFocus={() => setIsSearchOpen(true)}
                  placeholder="Поиск материалов"
                  className="w-64 rounded-full pl-9"
                />
                {isSearching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-neutral-400" />}
              </div>
              <Button variant="muted" onClick={() => setIsSearchOpen(true)}>
                <Sparkles className="mr-2 h-4 w-4" /> Быстрый переход
              </Button>
            </div>
          </div>

          {selectedId && page ? (
            readOnly ? (
              <article className="mx-auto max-w-3xl rounded-xl border border-neutral-200 bg-white p-10 shadow-sm">
                <h2 className="text-3xl font-semibold mb-6 text-neutral-900">{page.title}</h2>
                <pre className="whitespace-pre-wrap text-base leading-relaxed text-neutral-800">
                  {page.contentMd || 'Материал пока пуст.'}
                </pre>
              </article>
            ) : (
              <MaterialsPageEditor orgId={orgId} pageId={page.id} initialTitle={page.title} initialContent={page.contentMd} />
            )
          ) : isLoading ? (
            <MaterialsEditorPlaceholder />
          ) : (
            <div className="h-full rounded-xl border border-dashed border-neutral-300 bg-white/70 p-12 flex items-center justify-center text-center text-neutral-500">
              <div>
                <h2 className="text-lg font-medium text-neutral-700">Добро пожаловать в материалы организации</h2>
                <p className="mt-2 text-sm text-neutral-500">
                  {readOnly
                    ? 'Выберите страницу слева, чтобы изучить материалы, подготовленные администраторами.'
                    : 'Выберите страницу слева или создайте новую, чтобы начать наполнять раздел знаниями.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
      <CommandDialog open={isSearchOpen} onOpenChange={setIsSearchOpen}>
        <CommandInput placeholder="Название или часть...»" value={searchValue} onValueChange={setSearchValue} />
        <CommandList>
          <CommandEmpty>Ничего не найдено.</CommandEmpty>
          <CommandGroup heading="Страницы">
            {searchResults.length === 0
              ? flattenedTree.map(item => (
                  <CommandItem
                    key={item.id}
                    value={item.node.title}
                    onSelect={() => handleSelect(item.id)}
                  >
                    {item.node.title}
                  </CommandItem>
                ))
              : searchResults.map(result => (
                  <CommandItem key={result.page_id} value={result.title} onSelect={() => handleSelect(result.page_id)}>
                    {result.title}
                  </CommandItem>
                ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}

function firstPageId(tree: MaterialTreeNode[]): string | null {
  if (tree.length === 0) {
    return null;
  }
  const first = tree[0];
  if (first.children.length > 0) {
    return firstPageId(first.children);
  }
  return first.id;
}

function flattenTree(nodes: MaterialTreeNode[]): Array<{ id: string; node: MaterialTreeNode }> {
  const result: Array<{ id: string; node: MaterialTreeNode }> = [];
  const walk = (items: MaterialTreeNode[]) => {
    items.forEach(item => {
      result.push({ id: item.id, node: item });
      if (item.children?.length) {
        walk(item.children);
      }
    });
  };
  walk(nodes);
  return result;
}
