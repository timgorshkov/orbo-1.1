'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { X, Upload, Trash2 } from 'lucide-react'

interface PhotoUploadModalProps {
  isOpen: boolean
  onClose: () => void
  currentPhotoUrl: string | null
  participantId: string
  orgId: string
  onPhotoUpdate: (photoUrl: string | null) => void
}

export default function PhotoUploadModal({
  isOpen,
  onClose,
  currentPhotoUrl,
  participantId,
  orgId,
  onPhotoUpdate,
}: PhotoUploadModalProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Проверка типа файла
      if (!file.type.startsWith('image/')) {
        alert('Пожалуйста, выберите изображение')
        return
      }
      
      // Проверка размера (макс 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert('Размер файла не должен превышать 10 МБ')
        return
      }
      
      setSelectedFile(file)
      const reader = new FileReader()
      reader.onload = () => {
        setSelectedImage(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      alert('Пожалуйста, выберите изображение')
      return
    }

    setUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('orgId', orgId)

      const response = await fetch(`/api/participants/${participantId}/photo`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to upload photo')
      }

      const data = await response.json()
      onPhotoUpdate(data.photo_url)
      setSelectedImage(null)
      setSelectedFile(null)
      onClose()
    } catch (error: any) {
      console.error('Upload error:', error)
      alert(error.message || 'Не удалось загрузить фото')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Удалить фотографию?')) return

    setUploading(true)

    try {
      const response = await fetch(`/api/participants/${participantId}/photo`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orgId }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete photo')
      }

      onPhotoUpdate(null)
      setSelectedImage(null)
      setSelectedFile(null)
      onClose()
    } catch (error: any) {
      console.error('Delete error:', error)
      alert(error.message || 'Не удалось удалить фото')
    } finally {
      setUploading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Загрузить фотографию</h2>
          <button
            onClick={onClose}
            className="rounded-full p-2 hover:bg-gray-100"
            disabled={uploading}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4">
          {!selectedImage ? (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 p-12 hover:border-blue-500 hover:bg-blue-50"
              >
                <Upload className="h-8 w-8 text-gray-400" />
                <span className="text-lg text-gray-600">
                  Выберите изображение
                </span>
              </button>
              <p className="mt-2 text-center text-sm text-gray-500">
                Изображение будет автоматически обрезано по центру
              </p>
            </div>
          ) : (
            <div>
              <p className="mb-2 text-sm text-gray-600 text-center">
                Предпросмотр:
              </p>
              <div className="flex justify-center">
                <div className="relative w-48 h-48 overflow-hidden rounded-full border-4 border-gray-200">
                  <img
                    src={selectedImage}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-between">
          <div>
            {currentPhotoUrl && (
              <Button
                variant="outline"
                onClick={handleDelete}
                disabled={uploading}
                className="gap-2 text-red-600 hover:text-red-800"
              >
                <Trash2 className="h-4 w-4" />
                Удалить фото
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {selectedImage && (
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedImage(null)
                  setSelectedFile(null)
                }}
                disabled={uploading}
              >
                Выбрать другое
              </Button>
            )}
            <Button onClick={onClose} variant="outline" disabled={uploading}>
              Отмена
            </Button>
            {selectedImage && (
              <Button onClick={handleUpload} disabled={uploading}>
                {uploading ? 'Загрузка...' : 'Сохранить'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
