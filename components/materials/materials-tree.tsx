'use client';

import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { MaterialTreeNode } from '@/lib/server/materials/service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronRight, FileText, Folder, FolderOpen, MoreHorizontal, Plus, Search } from 'lucide-react';

const MAX_DEPTH = 3;

type DropData =
  | { type: 'between'; parentId: string | null; position: number; depth: number }
  | { type: 'inside'; nodeId: string; depth: number };

type Snapshot = {
  tree: MaterialTreeNode[];
  flattened: Array<{ id: string; parentId: string | null; index: number }>;
};

type MaterialsTreeProps = {
  orgId: string;
  initialTree: MaterialTreeNode[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onTreeChange?: (tree: MaterialTreeNode[]) => void;
  onSearchOpen?: () => void;
};

export function MaterialsTree({ orgId, initialTree, selectedId, onSelect, onTreeChange, onSearchOpen }: MaterialsTreeProps) {
  const [tree, setTree] = useState<MaterialTreeNode[]>(initialTree);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(initialTree.map(node => node.id)));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [menuState, setMenuState] = useState<TreeMenuState | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const snapshotRef = useRef<Snapshot | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    setTree(initialTree);
    setExpanded(new Set(initialTree.map(node => node.id)));
  }, [initialTree]);

  useEffect(() => {
    if (!menuState) return;
    const handleEscape = (event: KeyboardEvent) => event.key === 'Escape' && setMenuState(null);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuState]);

  const reloadTree = useCallback(
    async (updateExpanded?: (prev: Set<string>, available: Set<string>) => Set<string>) => {
      const response = await fetch(`/api/materials/tree?orgId=${orgId}`);
      if (!response.ok) {
        throw new Error('Не удалось обновить дерево материалов');
      }
      const payload = await response.json();
      const fresh: MaterialTreeNode[] = payload.tree ?? [];
      setTree(fresh);

      const available = new Set<string>();
      const collect = (nodes: MaterialTreeNode[]) => {
        nodes.forEach(node => {
          available.add(node.id);
          if (node.children?.length) collect(node.children);
        });
      };
      collect(fresh);

      setExpanded(prev => {
        const base = new Set<string>();
        prev.forEach(id => available.has(id) && base.add(id));
        return updateExpanded ? updateExpanded(base, available) : base;
      });

      return fresh;
    },
    [orgId]
  );

  const captureSnapshot = useCallback(() => {
    snapshotRef.current = {
      tree,
      flattened: collectPositions(tree)
    };
  }, [tree]);

  const restoreSnapshot = useCallback(() => {
    if (!snapshotRef.current) return;
    setTree(snapshotRef.current.tree);
    const expandedIds = new Set(expanded);
    snapshotRef.current.flattened.forEach(item => {
      if (item.parentId) expandedIds.add(item.parentId);
    });
    setExpanded(expandedIds);
    snapshotRef.current = null;
  }, [expanded]);

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const updateTreeState = useCallback(
    (updater: (current: MaterialTreeNode[]) => MaterialTreeNode[]) => {
      setTree(prev => {
        const next = updater(prev);
        onTreeChange?.(next);
        return next;
      });
    },
    [onTreeChange]
  );

  const handleCreate = useCallback(
    (parentId: string | null) => {
      startTransition(async () => {
        try {
          setPendingId(parentId ?? 'root');
          const response = await fetch('/api/materials/tree', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orgId, parentId, title: 'Новая страница' })
          });
          if (!response.ok) throw new Error('Не удалось создать страницу');
          const { page } = await response.json();
          const newId: string = page.id;

          await reloadTree((prev, available) => {
            const next = new Set(prev);
            if (parentId && available.has(parentId)) next.add(parentId);
            if (available.has(newId)) next.add(newId);
            return next;
          });

          setEditingId(newId);
          onSelect?.(newId);
        } catch (error) {
          console.error(error);
        } finally {
          setPendingId(null);
        }
      });
    },
    [orgId, onSelect, reloadTree]
  );

  const handleRename = useCallback(
    (nodeId: string, title: string) => {
      startTransition(async () => {
        try {
          setPendingId(nodeId);
          const response = await fetch(`/api/materials/${nodeId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orgId, title })
          });
          if (!response.ok) throw new Error('Не удалось обновить страницу');
          await reloadTree();
        } catch (error) {
          console.error(error);
        } finally {
          setPendingId(null);
          setEditingId(null);
        }
      });
    },
    [orgId, reloadTree]
  );

  const handleDelete = useCallback(
    (nodeId: string) => {
      if (!confirm('Удалить страницу вместе со всеми вложенными материалами?')) return;
      startTransition(async () => {
        try {
          setPendingId(nodeId);
          const response = await fetch(`/api/materials/${nodeId}?orgId=${orgId}`, {
            method: 'DELETE'
          });
          if (!response.ok) throw new Error('Не удалось удалить страницу');
          await reloadTree();
          if (selectedId === nodeId) onSelect?.(null);
        } catch (error) {
          console.error(error);
        } finally {
          setPendingId(null);
        }
      });
    },
    [orgId, selectedId, onSelect, reloadTree]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    captureSnapshot();
    setActiveId(event.active.id as string);
  }, [captureSnapshot]);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!active || !over) {
        restoreSnapshot();
        return;
      }

      const dropData = over.data.current as DropData | undefined;
      if (!dropData) {
        restoreSnapshot();
        return;
      }

      const activeId = active.id as string;
      const { tree: withoutNode, removed, parentId: oldParent, index: oldIndex } = detachNode(tree, activeId);
      if (!removed) {
        restoreSnapshot();
        return;
      }

      let targetParentId: string | null = null;
      let targetIndex = 0;
      if (dropData.type === 'inside') {
        if (dropData.depth > MAX_DEPTH) {
          restoreSnapshot();
          return;
        }
        targetParentId = dropData.nodeId;
        targetIndex = getChildCount(withoutNode, dropData.nodeId);
      } else {
        if (dropData.depth > MAX_DEPTH) {
          restoreSnapshot();
          return;
        }
        targetParentId = dropData.parentId;
        targetIndex = dropData.position;
      }

      let adjustedIndex = targetIndex;
      if (oldParent === targetParentId && oldIndex < targetIndex) {
        adjustedIndex = Math.max(0, targetIndex - 1);
      }

      const inserted = insertNode(withoutNode, removed, targetParentId, adjustedIndex);
      const updated = updatePositions(inserted);
      setTree(updated);
      onTreeChange?.(updated);
      snapshotRef.current = null;

      try {
        const response = await fetch('/api/materials/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orgId, pageId: activeId, parentId: targetParentId, position: adjustedIndex })
        });
        if (!response.ok) {
          throw new Error('Failed to persist order');
        }
      } catch (error) {
        console.error('Failed to persist order', error);
        restoreSnapshot();
        reloadTree();
      }
    },
    [tree, orgId, onTreeChange, restoreSnapshot, reloadTree]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    restoreSnapshot();
  }, [restoreSnapshot]);

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
      <div className="overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Материалы</h2>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              className="h-7 w-7 !p-0"
              onClick={() => onSearchOpen?.()}
              aria-label="Поиск материалов"
            >
              <Search className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-7 px-2 gap-1"
              onClick={() => handleCreate(null)}
              disabled={pendingId === 'root'}
              aria-label="Добавить корневую страницу"
            >
              <Plus className="h-4 w-4" />
              <span className="text-xs">Добавить</span>
            </Button>
          </div>
        </div>
        <TreeList
          tree={tree}
          parentId={null}
          depth={0}
          expanded={expanded}
          toggle={toggle}
          onCreate={handleCreate}
          onStartRename={setEditingId}
          onSubmitRename={handleRename}
          onDelete={handleDelete}
          selectedId={selectedId ?? null}
          onSelect={onSelect}
          editingId={editingId}
          pendingId={pendingId}
          openMenu={setMenuState}
          activeId={activeId}
        />
      </div>
      {menuState && (
        <TreeActionsMenu
          anchor={menuState.anchor}
          onAdd={() => handleCreate(menuState.nodeId)}
          onRename={() => setEditingId(menuState.nodeId)}
          onDelete={() => handleDelete(menuState.nodeId)}
          onClose={() => setMenuState(null)}
        />
      )}
      <DragOverlay>{activeId ? <TreeDragPreview nodeId={activeId} tree={tree} /> : null}</DragOverlay>
    </DndContext>
  );
}

type TreeListProps = {
  tree: MaterialTreeNode[];
  parentId: string | null;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
  onCreate: (parentId: string | null) => void;
  onStartRename: (id: string | null) => void;
  onSubmitRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  selectedId: string | null;
  onSelect?: (id: string | null) => void;
  editingId: string | null;
  pendingId: string | null;
  openMenu: (state: TreeMenuState | null) => void;
  activeId: string | null;
};

function TreeList(props: TreeListProps) {
  const { tree, parentId, depth } = props;
  return (
    <div>
      <DropBetween parentId={parentId} depth={depth} position={0} />
      {tree.map((node, index) => (
        <div key={node.id}>
          <TreeItem {...props} node={node} parentId={parentId} depth={depth} />
          <DropBetween parentId={parentId} depth={depth} position={index + 1} />
        </div>
      ))}
    </div>
  );
}

type TreeItemProps = TreeListProps & {
  node: MaterialTreeNode;
  parentId: string | null;
};

function TreeItem({ node, parentId, depth, expanded, ...rest }: TreeItemProps) {
  const isExpanded = expanded.has(node.id);
  return (
    <div>
      <TreeRow {...rest} expanded={expanded} node={node} parentId={parentId} depth={depth} />
      {node.children.length > 0 && isExpanded && (
        <div className="ml-4 border-l border-dashed border-neutral-200 pl-2">
          <TreeList
            tree={node.children}
            parentId={node.id}
            depth={depth + 1}
            expanded={expanded}
            toggle={rest.toggle}
            onCreate={rest.onCreate}
            onStartRename={rest.onStartRename}
            onSubmitRename={rest.onSubmitRename}
            onDelete={rest.onDelete}
            selectedId={rest.selectedId}
            onSelect={rest.onSelect}
            editingId={rest.editingId}
            pendingId={rest.pendingId}
            openMenu={rest.openMenu}
            activeId={rest.activeId}
          />
        </div>
      )}
    </div>
  );
}

type TreeRowProps = TreeListProps & {
  node: MaterialTreeNode;
  parentId: string | null;
  depth: number;
};

function TreeRow({ node, parentId, depth, expanded, toggle, onCreate, onStartRename, onSubmitRename, onDelete, selectedId, onSelect, editingId, pendingId, openMenu, activeId }: TreeRowProps) {
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({ id: node.id, data: { type: 'item', nodeId: node.id, parentId, depth } });
  const { setNodeRef: setInsideRef, isOver: isOverInside } = useDroppable({ id: `inside-${node.id}`, data: { type: 'inside', nodeId: node.id, depth: depth + 1 } });

  const disabled = pendingId === node.id;
  const isSelected = selectedId === node.id;
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.id);

  return (
    <div className="relative">
      <div
        ref={setDragRef}
        className={clsx(
          'group flex items-center justify-between rounded px-2 select-none cursor-grab transition',
          isDragging && 'opacity-60',
          isSelected && 'bg-neutral-100',
          isOverInside && 'ring-2 ring-blue-400 bg-blue-50/30',
          disabled && 'opacity-60 pointer-events-none'
        )}
        style={{ 
          transform: transform ? CSS.Translate.toString(transform) : undefined,
          paddingTop: '2px',
          paddingBottom: '2px'
        }}
        {...attributes}
        {...listeners}
      >
        <div className="flex items-center gap-1 overflow-hidden">
          {hasChildren ? (
            <button
              className="p-1 rounded hover:bg-neutral-200"
              onClick={event => {
                event.stopPropagation();
                toggle(node.id);
              }}
              aria-label={isExpanded ? 'Свернуть' : 'Развернуть'}
            >
              <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
            </button>
          ) : (
            <span className="w-6 block" />
          )}
          <span className="text-neutral-400">
            {hasChildren ? (isExpanded ? <FolderOpen className="h-4 w-4" /> : <Folder className="h-4 w-4" />) : <FileText className="h-4 w-4" />}
          </span>
          {editingId === node.id ? (
            <InlineRename
              defaultValue={node.title}
              onCancel={() => onStartRename(null)}
              onSubmit={value => onSubmitRename(node.id, value)}
            />
          ) : (
            <button
              className="flex-1 truncate px-1 text-left text-sm font-medium text-neutral-800 hover:text-neutral-950"
              onClick={event => {
                event.stopPropagation();
                onSelect?.(node.id);
              }}
              title={node.title}
            >
              {node.title}
            </button>
          )}
        </div>
        <button
          className={clsx(
            'h-6 w-6 rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900',
            'opacity-0 transition group-hover:opacity-100 focus:opacity-100'
          )}
          onPointerDown={event => {
            event.stopPropagation();
          }}
          onClick={event => {
            event.stopPropagation();
            const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
            openMenu({ nodeId: node.id, anchor: { x: rect.right + 8, y: rect.top + window.scrollY } });
          }}
          aria-label="Действия"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
      {/* Drop zone "inside" - только центральная часть элемента */}
      {activeId !== node.id && (
        <div
          ref={setInsideRef}
          className="absolute inset-x-0 pointer-events-none"
          style={{ top: '25%', bottom: '25%' }}
        />
      )}
    </div>
  );
}


type DropBetweenProps = {
  parentId: string | null;
  depth: number;
  position: number;
};

function DropBetween({ parentId, depth, position }: DropBetweenProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `between-${parentId ?? 'root'}-${position}`,
    data: { type: 'between', parentId, position, depth }
  });

  const isRoot = depth === 0 && parentId === null && position === 0;
  const leftOffset = depth * 16 + 24;

  return (
    <div
      ref={setNodeRef}
      className="relative"
      style={{ height: isRoot ? 0 : 12, pointerEvents: isRoot ? 'none' : 'auto' }}
    >
      {!isRoot && (
        <div
          className={clsx(
            'absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 transition-all duration-150',
            isOver ? 'bg-blue-500' : 'bg-transparent'
          )}
          style={{ marginLeft: leftOffset }}
        />
      )}
    </div>
  );
}

type InlineRenameProps = {
  defaultValue: string;
  onCancel: () => void;
  onSubmit: (value: string) => void;
};

function InlineRename({ defaultValue, onCancel, onSubmit }: InlineRenameProps) {
  const [value, setValue] = useState(defaultValue);

  const commit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) {
      setValue(defaultValue);
      onCancel();
      return;
    }
    onSubmit(trimmed);
  }, [value, defaultValue, onSubmit, onCancel]);

  return (
    <form
      className="flex-1"
      onSubmit={event => {
        event.preventDefault();
        commit();
      }}
    >
      <Input
        autoFocus
        value={value}
        onChange={event => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            setValue(defaultValue);
            onCancel();
          }
        }}
        className="h-7 text-sm"
      />
    </form>
  );
}

type TreeMenuState = {
  nodeId: string;
  anchor: { x: number; y: number };
};

function TreeActionsMenu({ anchor, onAdd, onRename, onDelete, onClose }: { anchor: { x: number; y: number }; onAdd: () => void; onRename: () => void; onDelete: () => void; onClose: () => void }) {
  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 w-52 rounded-lg border border-neutral-200 bg-white p-2 text-sm shadow-xl"
        style={{ top: anchor.y, left: anchor.x }}
        onMouseDown={event => event.stopPropagation()}
      >
        <button
          className="flex w-full items-center gap-2 rounded px-2 py-1 hover:bg-neutral-100"
          onMouseDown={event => event.stopPropagation()}
          onClick={event => {
            event.stopPropagation();
            onAdd();
            onClose();
          }}
        >
          <span className="text-neutral-500">＋</span>
          Вложен. страница
        </button>
        <button
          className="flex w-full items-center gap-2 rounded px-2 py-1 hover:bg-neutral-100"
          onMouseDown={event => event.stopPropagation()}
          onClick={event => {
            event.stopPropagation();
            onRename();
            onClose();
          }}
        >
          <span className="text-neutral-500">Аб</span>
          Переименовать
        </button>
        <button
          className="flex w-full items-center gap-2 rounded px-2 py-1 text-red-600 hover:bg-neutral-100"
          onMouseDown={event => event.stopPropagation()}
          onClick={event => {
            event.stopPropagation();
            onDelete();
            onClose();
          }}
        >
          <span className="text-red-500">×</span>
          Удалить страницу
        </button>
      </div>
    </>,
    document.body
  );
}

type TreeDragPreviewProps = {
  nodeId: string;
  tree: MaterialTreeNode[];
};

function TreeDragPreview({ nodeId, tree }: TreeDragPreviewProps) {
  const node = findNode(tree, nodeId);
  if (!node) return null;
  return (
    <div className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm shadow-lg">
      {node.title}
    </div>
  );
}

function useCombinedRefs<T>(...refs: (((instance: T | null) => void) | React.MutableRefObject<T | null>)[]) {
  return (node: T | null) => {
    refs.forEach(ref => {
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        (ref as React.MutableRefObject<T | null>).current = node;
      }
    });
  };
}

function detachNode(nodes: MaterialTreeNode[], nodeId: string, parentId: string | null = null): { tree: MaterialTreeNode[]; removed: MaterialTreeNode | null; parentId: string | null; index: number } {
  const next: MaterialTreeNode[] = [];
  let removed: MaterialTreeNode | null = null;
  let removedParent: string | null = null;
  let removedIndex = -1;

  nodes.forEach((node, index) => {
    if (removed) {
      next.push(node);
      return;
    }
    if (node.id === nodeId) {
      removed = { ...node, children: node.children ? [...node.children] : [] };
      removedParent = parentId;
      removedIndex = index;
      return;
    }
    if (node.children?.length) {
      const result = detachNode(node.children, nodeId, node.id);
      if (result.removed) {
        removed = result.removed;
        removedParent = result.parentId;
        removedIndex = result.index;
        next.push({ ...node, children: result.tree });
        return;
      }
    }
    next.push(node);
  });

  return { tree: next, removed, parentId: removedParent, index: removedIndex };
}

function insertNode(nodes: MaterialTreeNode[], node: MaterialTreeNode, parentId: string | null, index: number): MaterialTreeNode[] {
  if (parentId === null) {
    const copy = nodes.map(item => ({ ...item }));
    copy.splice(index, 0, node);
    return copy;
  }

  return nodes.map(item => {
    if (item.id === parentId) {
      const children = item.children ? [...item.children] : [];
      children.splice(index, 0, node);
      return { ...item, children };
    }
    if (item.children?.length) {
      return { ...item, children: insertNode(item.children, node, parentId, index) };
    }
    return item;
  });
}

function updatePositions(nodes: MaterialTreeNode[]): MaterialTreeNode[] {
  return nodes.map((node, index) => ({
    ...node,
    position: index,
    children: node.children ? updatePositions(node.children) : []
  }));
}

function getChildCount(nodes: MaterialTreeNode[], parentId: string): number {
  const found = findNode(nodes, parentId);
  return found?.children.length ?? 0;
}

function findNode(nodes: MaterialTreeNode[], nodeId: string): MaterialTreeNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    if (node.children?.length) {
      const found = findNode(node.children, nodeId);
      if (found) return found;
    }
  }
  return null;
}

function flattenTree(nodes: MaterialTreeNode[]): Array<{ id: string; node: MaterialTreeNode }> {
  const result: Array<{ id: string; node: MaterialTreeNode }> = [];
  const walk = (items: MaterialTreeNode[]) => {
    items.forEach(item => {
      result.push({ id: item.id, node: item });
      if (item.children?.length) walk(item.children);
    });
  };
  walk(nodes);
  return result;
}

function collectPositions(nodes: MaterialTreeNode[], parentId: string | null = null): Array<{ id: string; parentId: string | null; index: number }> {
  const result: Array<{ id: string; parentId: string | null; index: number }> = [];
  nodes.forEach((node, index) => {
    result.push({ id: node.id, parentId, index });
    if (node.children?.length) {
      result.push(...collectPositions(node.children, node.id));
    }
  });
  return result;
}

