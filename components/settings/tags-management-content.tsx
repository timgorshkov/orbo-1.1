'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Edit2, Trash2, Save, X, Tag } from 'lucide-react'

// Predefined color palette
const TAG_COLORS = [
  { value: '#3B82F6', label: 'Blue', description: 'General purpose' },
  { value: '#10B981', label: 'Green', description: 'Positive, Active, Paid' },
  { value: '#F59E0B', label: 'Yellow', description: 'Warning, Attention' },
  { value: '#F97316', label: 'Orange', description: 'In Progress, Pipeline' },
  { value: '#EF4444', label: 'Red', description: 'Urgent, Problem, Risk' },
  { value: '#8B5CF6', label: 'Purple', description: 'VIP, Premium' },
  { value: '#EC4899', label: 'Pink', description: 'Special, Featured' },
  { value: '#6366F1', label: 'Indigo', description: 'Expertise, Mentor' },
  { value: '#14B8A6', label: 'Teal', description: 'Success, Completed' },
  { value: '#6B7280', label: 'Gray', description: 'Neutral, Archived' },
]

type TagType = {
  tag_id: string
  tag_name: string
  tag_color: string
  participant_count: number
  last_used: string | null
}

export default function TagsManagementContent() {
  const params = useParams()
  const orgId = params?.org as string

  const [tags, setTags] = useState<TagType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create/Edit modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTag, setEditingTag] = useState<TagType | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    color: '#3B82F6',
    description: '',
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Delete confirmation
  const [deletingTagId, setDeletingTagId] = useState<string | null>(null)

  useEffect(() => {
    if (orgId) {
      fetchTags()
    }
  }, [orgId])

  const fetchTags = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/organizations/${orgId}/tags`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch tags')
      }

      const data = await response.json()
      setTags(data.tags || [])
    } catch (err) {
      console.error('Error fetching tags:', err)
      setError('Failed to load tags')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenModal = (tag?: TagType) => {
    if (tag) {
      setEditingTag(tag)
      setFormData({
        name: tag.tag_name,
        color: tag.tag_color,
        description: '',
      })
    } else {
      setEditingTag(null)
      setFormData({
        name: '',
        color: '#3B82F6',
        description: '',
      })
    }
    setFormError(null)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingTag(null)
    setFormData({ name: '', color: '#3B82F6', description: '' })
    setFormError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setSaving(true)

    try {
      const url = editingTag
        ? `/api/organizations/${orgId}/tags/${editingTag.tag_id}`
        : `/api/organizations/${orgId}/tags`

      const method = editingTag ? 'PATCH' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save tag')
      }

      await fetchTags()
      handleCloseModal()
    } catch (err: any) {
      console.error('Error saving tag:', err)
      setFormError(err.message || 'Failed to save tag')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (tagId: string) => {
    if (deletingTagId === tagId) {
      // Confirm deletion
      try {
        const response = await fetch(`/api/organizations/${orgId}/tags/${tagId}`, {
          method: 'DELETE',
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || 'Failed to delete tag')
        }

        await fetchTags()
        setDeletingTagId(null)
      } catch (err: any) {
        console.error('Error deleting tag:', err)
        alert(err.message || 'Failed to delete tag')
      }
    } else {
      // Show confirmation
      setDeletingTagId(tagId)
    }
  }

  const cancelDelete = () => {
    setDeletingTagId(null)
  }

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-end mb-6">
        <Button onClick={() => handleOpenModal()} className="flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Создать тег
        </Button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {error}
        </div>
      )}

      {tags.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Tag className="w-16 h-16 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Теги не созданы
            </h3>
            <p className="text-gray-600 dark:text-gray-400 text-center mb-4">
              Создайте первый тег для сегментации участников
            </p>
            <Button onClick={() => handleOpenModal()} className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Создать тег
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {tags.map((tag) => (
            <Card key={tag.tag_id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: tag.tag_color }}
                    />
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {tag.tag_name}
                      </h3>
                      <div className="flex items-center gap-4 mt-1">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {tag.participant_count} {tag.participant_count === 1 ? 'участник' : 'участников'}
                        </span>
                        {tag.last_used && (
                          <span className="text-sm text-gray-500 dark:text-gray-500">
                            Последнее использование: {new Date(tag.last_used).toLocaleDateString('ru-RU')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {deletingTagId === tag.tag_id ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={cancelDelete}
                          className="text-gray-600"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(tag.tag_id)}
                          className="bg-red-600 text-white hover:bg-red-700 border-red-600"
                        >
                          Подтвердить
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenModal(tag)}
                          className="text-blue-600 hover:text-blue-700"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(tag.tag_id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
            <form onSubmit={handleSubmit}>
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {editingTag ? 'Редактировать тег' : 'Создать тег'}
                  </h2>
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                {formError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                    {formError}
                  </div>
                )}

                <div className="space-y-4">
                  {/* Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Название тега *
                    </label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Например: VIP клиент"
                      required
                      maxLength={50}
                      className="w-full"
                    />
                  </div>

                  {/* Color */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Цвет *
                    </label>
                    <div className="grid grid-cols-5 gap-2">
                      {TAG_COLORS.map((colorOption) => (
                        <button
                          key={colorOption.value}
                          type="button"
                          onClick={() => setFormData({ ...formData, color: colorOption.value })}
                          className={`w-full h-12 rounded-lg border-2 transition-all hover:scale-105 ${
                            formData.color === colorOption.value
                              ? 'border-gray-900 dark:border-white ring-2 ring-offset-2 ring-gray-900 dark:ring-white'
                              : 'border-gray-200 dark:border-gray-700'
                          }`}
                          style={{ backgroundColor: colorOption.value }}
                          title={`${colorOption.label} - ${colorOption.description}`}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      {TAG_COLORS.find((c) => c.value === formData.color)?.description}
                    </p>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Описание (опционально)
                    </label>
                    <Textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Краткое описание для чего используется этот тег"
                      maxLength={200}
                      rows={3}
                      className="w-full resize-none"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {formData.description.length}/200
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 dark:bg-gray-900 rounded-b-lg">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseModal}
                  disabled={saving}
                >
                  Отмена
                </Button>
                <Button
                  type="submit"
                  disabled={saving || !formData.name.trim()}
                  className="flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Сохранение...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      {editingTag ? 'Сохранить' : 'Создать'}
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

