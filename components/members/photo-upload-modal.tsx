'use client'

import { useState, useRef, useCallback } from 'react'
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
  const [crop, setCrop] = useState({ x: 0, y: 0, width: 0, height: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = () => {
        setSelectedImage(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageRef.current) return
    
    const rect = imageRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    setIsDragging(true)
    setCrop({ x, y, width: 0, height: 0 })
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !imageRef.current) return
    
    const rect = imageRef.current.getBoundingClientRect()
    const currentX = e.clientX - rect.left
    const currentY = e.clientY - rect.top
    
    const width = currentX - crop.x
    const height = currentY - crop.y
    const size = Math.min(Math.abs(width), Math.abs(height))
    
    setCrop({
      x: width < 0 ? currentX : crop.x,
      y: height < 0 ? currentY : crop.y,
      width: size,
      height: size,
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const getCroppedImage = useCallback(async (): Promise<Blob | null> => {
    if (!imageRef.current || !canvasRef.current || !selectedImage) return null

    const image = imageRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    
    if (!ctx) return null

    const scaleX = image.naturalWidth / image.width
    const scaleY = image.naturalHeight / image.height

    canvas.width = crop.width * scaleX
    canvas.height = crop.height * scaleY

    ctx.drawImage(
      image,
      crop.x * scaleX,
      crop.y * scaleY,
      crop.width * scaleX,
      crop.height * scaleY,
      0,
      0,
      canvas.width,
      canvas.height
    )

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob)
      }, 'image/jpeg', 0.95)
    })
  }, [selectedImage, crop])

  const handleUpload = async () => {
    if (!selectedImage || crop.width === 0) {
      alert('Пожалуйста, выберите область для обрезки')
      return
    }

    setUploading(true)

    try {
      const croppedBlob = await getCroppedImage()
      
      if (!croppedBlob) {
        throw new Error('Failed to crop image')
      }

      const formData = new FormData()
      formData.append('file', croppedBlob, 'photo.jpg')
      formData.append('orgId', orgId)
      formData.append(
        'crop',
        JSON.stringify({
          x: crop.x,
          y: crop.y,
          width: crop.width,
          height: crop.height,
        })
      )

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
      <div className="relative w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl">
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
            </div>
          ) : (
            <div>
              <p className="mb-2 text-sm text-gray-600">
                Выделите квадратную область для обрезки (нажмите и перетащите):
              </p>
              <div
                className="relative inline-block cursor-crosshair"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <img
                  ref={imageRef}
                  src={selectedImage}
                  alt="Preview"
                  className="max-h-96 max-w-full"
                />
                {crop.width > 0 && (
                  <div
                    className="absolute border-2 border-blue-500 bg-blue-500/20"
                    style={{
                      left: crop.x,
                      top: crop.y,
                      width: crop.width,
                      height: crop.height,
                    }}
                  />
                )}
              </div>
              <canvas ref={canvasRef} className="hidden" />
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
                Удалить текущее фото
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {selectedImage && (
              <Button
                variant="outline"
                onClick={() => setSelectedImage(null)}
                disabled={uploading}
              >
                Выбрать другое
              </Button>
            )}
            <Button onClick={onClose} variant="outline" disabled={uploading}>
              Отмена
            </Button>
            {selectedImage && (
              <Button onClick={handleUpload} disabled={uploading || crop.width === 0}>
                {uploading ? 'Загрузка...' : 'Сохранить'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

