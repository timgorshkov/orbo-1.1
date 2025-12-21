'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Upload, X, Image as ImageIcon } from 'lucide-react'

interface CoverImageUploadProps {
  value: string | null
  onChange: (url: string | null) => void
  onFileSelect?: (file: File | null) => void
  eventId?: string
  orgId: string
  disabled?: boolean
}

export default function CoverImageUpload({
  value,
  onChange,
  onFileSelect,
  eventId,
  orgId,
  disabled = false
}: CoverImageUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Пожалуйста, выберите изображение')
      return
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Размер файла не должен превышать 5 МБ')
      return
    }

    // If eventId is provided, upload to server
    if (eventId) {
      setUploading(true)
      setError(null)

      try {
        const formData = new FormData()
        formData.append('file', file)

        const response = await fetch(`/api/events/${eventId}/cover`, {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || 'Не удалось загрузить изображение')
        }

        const data = await response.json()
        onChange(data.cover_image_url)
      } catch (err: any) {
        console.error('Upload error:', err)
        setError(err.message || 'Не удалось загрузить изображение')
      } finally {
        setUploading(false)
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }
    } else {
      // For new events, create object URL for preview
      // Actual upload will happen when event is created
      const objectUrl = URL.createObjectURL(file)
      onChange(objectUrl)
      // Pass the file to parent for upload after event creation
      onFileSelect?.(file)
    }
  }

  const handleDelete = async () => {
    if (!eventId || !value) {
      onChange(null)
      onFileSelect?.(null)
      return
    }

    if (!confirm('Удалить обложку?')) return

    setUploading(true)
    setError(null)

    try {
      const response = await fetch(`/api/events/${eventId}/cover`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Не удалось удалить изображение')
      }

      onChange(null)
    } catch (err: any) {
      console.error('Delete error:', err)
      setError(err.message || 'Не удалось удалить изображение')
    } finally {
      setUploading(false)
    }
  }

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value || null)
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <div className="flex-1">
          <Input
            type="url"
            value={value || ''}
            onChange={handleUrlChange}
            placeholder="https://example.com/image.jpg или загрузите файл"
            disabled={disabled || uploading}
          />
        </div>
        {eventId && (
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || uploading}
          >
            <Upload className="w-4 h-4 mr-2" />
            {uploading ? 'Загрузка...' : 'Загрузить'}
          </Button>
        )}
        {!eventId && (
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || uploading}
          >
            <Upload className="w-4 h-4 mr-2" />
            Выбрать файл
          </Button>
        )}
        {value && eventId && (
          <Button
            type="button"
            variant="outline"
            onClick={handleDelete}
            disabled={disabled || uploading}
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || uploading}
      />

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {value && (
        <div className="relative mt-3">
          <img
            src={value}
            alt="Превью обложки"
            className="max-h-48 w-full object-cover rounded-lg border border-neutral-200"
            onError={() => {
              setError('Не удалось загрузить изображение')
              onChange(null)
            }}
          />
          {!eventId && value.startsWith('blob:') && (
            <p className="text-xs text-neutral-500 mt-1">
              Изображение будет загружено при сохранении события
            </p>
          )}
        </div>
      )}

      {!value && (
        <div className="border-2 border-dashed border-neutral-300 rounded-lg p-8 text-center">
          <ImageIcon className="w-12 h-12 mx-auto text-neutral-400 mb-2" />
          <p className="text-sm text-neutral-500">
            Укажите URL или загрузите изображение
          </p>
        </div>
      )}
    </div>
  )
}

