'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Plus, X, Tag as TagIcon } from 'lucide-react'

type Tag = {
  tag_id: string
  tag_name: string
  tag_color: string
  tag_description: string | null
  assigned_at: string
  assigned_by_name: string | null
}

type AvailableTag = {
  tag_id: string
  tag_name: string
  tag_color: string
  participant_count: number
}

interface ParticipantTagsManagerProps {
  participantId: string
  orgId: string
  isAdmin: boolean
}

export default function ParticipantTagsManager({
  participantId,
  orgId,
  isAdmin,
}: ParticipantTagsManagerProps) {
  const [assignedTags, setAssignedTags] = useState<Tag[]>([])
  const [availableTags, setAvailableTags] = useState<AvailableTag[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [processingTagId, setProcessingTagId] = useState<string | null>(null)

  useEffect(() => {
    fetchData()
  }, [participantId])

  const fetchData = async () => {
    try {
      setLoading(true)

      // Fetch participant's tags
      const tagsResponse = await fetch(`/api/participants/${participantId}/tags`)
      const tagsData = await tagsResponse.json()
      setAssignedTags(tagsData.tags || [])

      // Fetch all org tags
      const allTagsResponse = await fetch(`/api/organizations/${orgId}/tags`)
      const allTagsData = await allTagsResponse.json()
      setAvailableTags(allTagsData.tags || [])
    } catch (err) {
      console.error('Error fetching tags:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleAssignTag = async (tagId: string) => {
    try {
      setProcessingTagId(tagId)

      const response = await fetch(`/api/participants/${participantId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_id: tagId }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to assign tag')
      }

      await fetchData()
      setShowAddMenu(false)
    } catch (err: any) {
      console.error('Error assigning tag:', err)
      alert(err.message || 'Failed to assign tag')
    } finally {
      setProcessingTagId(null)
    }
  }

  const handleRemoveTag = async (tagId: string) => {
    if (!confirm('Удалить этот тег?')) return

    try {
      setProcessingTagId(tagId)

      const response = await fetch(`/api/participants/${participantId}/tags/${tagId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to remove tag')
      }

      await fetchData()
    } catch (err: any) {
      console.error('Error removing tag:', err)
      alert(err.message || 'Failed to remove tag')
    } finally {
      setProcessingTagId(null)
    }
  }

  // Filter out already assigned tags
  const unassignedTags = availableTags.filter(
    (tag) => !assignedTags.some((assigned) => assigned.tag_id === tag.tag_id)
  )

  if (!isAdmin) {
    // Tags are admin-only, don't show to regular members
    return null
  }

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-24 mb-3"></div>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 bg-gray-200 rounded w-20"></div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Теги (только для админов)
        </h3>
        {unassignedTags.length > 0 && (
          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            Добавить
          </button>
        )}
      </div>

      {/* Assigned Tags */}
      {assignedTags.length === 0 ? (
        <div className="text-sm text-gray-500 dark:text-gray-400 italic flex items-center gap-2 py-2">
          <TagIcon className="w-4 h-4" />
          Теги не назначены
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 mb-3">
          {assignedTags.map((tag) => (
            <div
              key={tag.tag_id}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-white"
              style={{ backgroundColor: tag.tag_color }}
            >
              <span>{tag.tag_name}</span>
              <button
                onClick={() => handleRemoveTag(tag.tag_id)}
                disabled={processingTagId === tag.tag_id}
                className="hover:bg-white/20 rounded-full p-0.5 transition-colors disabled:opacity-50"
                title="Удалить тег"
              >
                {processingTagId === tag.tag_id ? (
                  <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <X className="w-3 h-3" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add Tag Menu */}
      {showAddMenu && unassignedTags.length > 0 && (
        <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Доступные теги
            </span>
            <button
              onClick={() => setShowAddMenu(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {unassignedTags.map((tag) => (
              <button
                key={tag.tag_id}
                onClick={() => handleAssignTag(tag.tag_id)}
                disabled={processingTagId === tag.tag_id}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-white hover:opacity-80 transition-opacity disabled:opacity-50"
                style={{ backgroundColor: tag.tag_color }}
              >
                {processingTagId === tag.tag_id ? (
                  <>
                    <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                    <span>{tag.tag_name}</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3 h-3" />
                    <span>{tag.tag_name}</span>
                  </>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Info for admins */}
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
        Теги видны только администраторам и используются для сегментации участников
      </p>
    </div>
  )
}

