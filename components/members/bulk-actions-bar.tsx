'use client'

import { useState } from 'react'
import { X, Tag, Download, Trash2, Archive } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Tag {
  id: string
  name: string
  color: string
}

interface BulkActionsBarProps {
  selectedCount: number
  availableTags: Tag[]
  onClearSelection: () => void
  onAssignTags: (tagIds: string[]) => Promise<void>
  onRemoveTags: (tagIds: string[]) => Promise<void>
  onExportSelected: () => void
  onArchiveSelected?: () => Promise<void>
}

export default function BulkActionsBar({
  selectedCount,
  availableTags,
  onClearSelection,
  onAssignTags,
  onRemoveTags,
  onExportSelected,
  onArchiveSelected,
}: BulkActionsBarProps) {
  const [showTagsMenu, setShowTagsMenu] = useState(false)
  const [showRemoveTagsMenu, setShowRemoveTagsMenu] = useState(false)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)

  const handleAssignTags = async () => {
    if (selectedTags.length === 0) return
    
    setIsLoading(true)
    try {
      await onAssignTags(selectedTags)
      setSelectedTags([])
      setShowTagsMenu(false)
    } catch (error) {
      console.error('Error assigning tags:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRemoveTags = async () => {
    if (selectedTags.length === 0) return
    
    setIsLoading(true)
    try {
      await onRemoveTags(selectedTags)
      setSelectedTags([])
      setShowRemoveTagsMenu(false)
    } catch (error) {
      console.error('Error removing tags:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const toggleTag = (tagId: string) => {
    setSelectedTags(prev => 
      prev.includes(tagId) 
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    )
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 p-4 min-w-[400px] max-w-2xl">
        <div className="flex items-center justify-between gap-4">
          {/* Selected Count */}
          <div className="flex items-center gap-3">
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              Выбрано: <span className="text-blue-600">{selectedCount}</span>
            </div>
            <button
              onClick={onClearSelection}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              title="Снять выделение"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Assign Tags */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowTagsMenu(!showTagsMenu)
                  setShowRemoveTagsMenu(false)
                }}
                className="gap-2"
              >
                <Tag className="w-4 h-4" />
                <span className="hidden md:inline">Назначить теги</span>
              </Button>

              {showTagsMenu && (
                <div className="absolute bottom-full mb-2 right-0 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-3 w-64 max-h-80 overflow-y-auto">
                  <div className="mb-3">
                    <div className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                      Выберите теги:
                    </div>
                    <div className="space-y-2">
                      {availableTags.length === 0 ? (
                        <div className="text-sm text-gray-500 py-2">
                          Нет доступных тегов
                        </div>
                      ) : (
                        availableTags.map((tag) => (
                          <label
                            key={tag.id}
                            className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedTags.includes(tag.id)}
                              onChange={() => toggleTag(tag.id)}
                              className="rounded border-gray-300"
                            />
                            <span
                              className="inline-block px-2 py-1 rounded text-xs font-medium text-white"
                              style={{ backgroundColor: tag.color }}
                            >
                              {tag.name}
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                  {selectedTags.length > 0 && (
                    <Button
                      onClick={handleAssignTags}
                      disabled={isLoading}
                      className="w-full"
                      size="sm"
                    >
                      {isLoading ? 'Применяем...' : `Применить (${selectedTags.length})`}
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Remove Tags */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowRemoveTagsMenu(!showRemoveTagsMenu)
                  setShowTagsMenu(false)
                }}
                className="gap-2"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden md:inline">Убрать теги</span>
              </Button>

              {showRemoveTagsMenu && (
                <div className="absolute bottom-full mb-2 right-0 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-3 w-64 max-h-80 overflow-y-auto">
                  <div className="mb-3">
                    <div className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                      Убрать теги:
                    </div>
                    <div className="space-y-2">
                      {availableTags.length === 0 ? (
                        <div className="text-sm text-gray-500 py-2">
                          Нет доступных тегов
                        </div>
                      ) : (
                        availableTags.map((tag) => (
                          <label
                            key={tag.id}
                            className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedTags.includes(tag.id)}
                              onChange={() => toggleTag(tag.id)}
                              className="rounded border-gray-300"
                            />
                            <span
                              className="inline-block px-2 py-1 rounded text-xs font-medium text-white"
                              style={{ backgroundColor: tag.color }}
                            >
                              {tag.name}
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                  {selectedTags.length > 0 && (
                    <Button
                      onClick={handleRemoveTags}
                      disabled={isLoading}
                      variant="outline"
                      className="w-full bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
                      size="sm"
                    >
                      {isLoading ? 'Удаляем...' : `Убрать (${selectedTags.length})`}
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Archive Selected */}
            {onArchiveSelected && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowArchiveConfirm(true)}
                className="gap-2 border-orange-300 text-orange-700 hover:bg-orange-50"
              >
                <Archive className="w-4 h-4" />
                <span className="hidden md:inline">Архивировать</span>
              </Button>
            )}

            {/* Export Selected */}
            <Button
              variant="outline"
              size="sm"
              onClick={onExportSelected}
              className="gap-2"
            >
              <Download className="w-4 h-4" />
              <span className="hidden md:inline">Экспорт</span>
            </Button>
          </div>
        </div>

        {/* Archive Confirmation Dialog */}
        {showArchiveConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold mb-2">Архивировать участников?</h3>
              <p className="text-sm text-gray-600 mb-4">
                Будет архивировано {selectedCount} участников. Они будут скрыты из списков, но все данные сохранятся. Вы сможете восстановить их позже.
              </p>
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setShowArchiveConfirm(false)}
                  disabled={isLoading}
                >
                  Отмена
                </Button>
                <Button
                  variant="destructive"
                  onClick={async () => {
                    if (!onArchiveSelected) return;
                    setIsLoading(true);
                    try {
                      await onArchiveSelected();
                      setShowArchiveConfirm(false);
                    } catch (error) {
                      console.error('Error archiving participants:', error);
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  disabled={isLoading}
                >
                  {isLoading ? 'Архивируем...' : 'Архивировать'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

