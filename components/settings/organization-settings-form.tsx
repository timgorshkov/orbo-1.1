'use client'

import { useState, useTransition, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Organization {
  id: string
  name: string
  slug: string
  logo_url: string | null
  public_description: string | null
  telegram_group_link: string | null
}

interface OrganizationSettingsFormProps {
  organization: Organization
  userRole: 'owner' | 'admin'
}

export default function OrganizationSettingsForm({
  organization,
  userRole
}: OrganizationSettingsFormProps) {
  const [name, setName] = useState(organization.name)
  const [publicDescription, setPublicDescription] = useState(organization.public_description || '')
  const [telegramGroupLink, setTelegramGroupLink] = useState(organization.telegram_group_link || '')
  const [logoUrl, setLogoUrl] = useState(organization.logo_url)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Только JPG и PNG файлы разрешены')
      return
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Размер файла должен быть меньше 5MB')
      return
    }

    setLogoFile(file)
    setError(null)

    // Create preview
    const reader = new FileReader()
    reader.onloadend = () => {
      setLogoPreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    startTransition(async () => {
      try {
        // Upload logo if changed
        let newLogoUrl = logoUrl
        if (logoFile) {
          const formData = new FormData()
          formData.append('file', logoFile)

          const uploadResponse = await fetch(`/api/organizations/${organization.id}/logo`, {
            method: 'POST',
            body: formData
          })

          if (!uploadResponse.ok) {
            const data = await uploadResponse.json()
            throw new Error(data.error || 'Не удалось загрузить логотип')
          }

          const uploadData = await uploadResponse.json()
          newLogoUrl = uploadData.logo_url
          setLogoUrl(newLogoUrl)
        }

        // Update organization settings
        const hasChanges = name.trim() !== organization.name || 
                           publicDescription !== (organization.public_description || '') ||
                           telegramGroupLink !== (organization.telegram_group_link || '')
        
        if (hasChanges) {
          const response = await fetch(`/api/organizations/${organization.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: name.trim(),
              logo_url: newLogoUrl,
              public_description: publicDescription.trim() || null,
              telegram_group_link: telegramGroupLink.trim() || null
            })
          })

          if (!response.ok) {
            const data = await response.json()
            throw new Error(data.error || 'Не удалось обновить настройки')
          }
        }

        setSuccess(true)
        setLogoFile(null)
        setLogoPreview(null)
        
        // Reload page to reflect changes
        setTimeout(() => {
          window.location.reload()
        }, 1000)
      } catch (err: any) {
        setError(err.message)
      }
    })
  }

  const handleRemoveLogo = () => {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/organizations/${organization.id}/logo`, {
          method: 'DELETE'
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || 'Не удалось удалить логотип')
        }

        setLogoUrl(null)
        setLogoPreview(null)
        setLogoFile(null)
        setSuccess(true)
        
        setTimeout(() => {
          window.location.reload()
        }, 1000)
      } catch (err: any) {
        setError(err.message)
      }
    })
  }

  const currentLogo = logoPreview || logoUrl

  return (
    <Card>
      <CardHeader>
        <CardTitle>Основные настройки</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Organization Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-neutral-700 mb-2">
              Название организации
            </label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isPending}
              required
              className="max-w-md"
            />
            <p className="text-sm text-neutral-500 mt-1">
              URL: /app/{organization.slug}
            </p>
          </div>

          {/* Public Description */}
          <div>
            <label htmlFor="publicDescription" className="block text-sm font-medium text-neutral-700 mb-2">
              Публичное описание <span className="text-neutral-500">(видно всем на странице сообщества)</span>
            </label>
            <textarea
              id="publicDescription"
              value={publicDescription}
              onChange={(e) => setPublicDescription(e.target.value)}
              disabled={isPending}
              rows={3}
              placeholder="Расскажите о вашем сообществе..."
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent max-w-2xl"
            />
            <p className="text-sm text-neutral-500 mt-1">
              Это описание будет показано на публичной странице сообщества (/p/{organization.slug})
            </p>
          </div>

          {/* Telegram Group Link */}
          <div>
            <label htmlFor="telegramGroupLink" className="block text-sm font-medium text-neutral-700 mb-2">
              Ссылка на Telegram-группу <span className="text-neutral-500">(опционально)</span>
            </label>
            <Input
              id="telegramGroupLink"
              type="url"
              value={telegramGroupLink}
              onChange={(e) => setTelegramGroupLink(e.target.value)}
              disabled={isPending}
              placeholder="https://t.me/yourcommunity"
              className="max-w-md"
            />
            <p className="text-sm text-neutral-500 mt-1">
              Ссылка будет показана на публичной странице сообщества
            </p>
          </div>

          {/* Logo */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Логотип организации
            </label>
            <p className="text-sm text-neutral-500 mb-3">
              Рекомендуем загружать квадратное изображение (JPG или PNG, до 5MB)
            </p>

            <div className="flex items-start gap-4">
              {currentLogo && (
                <div className="relative w-24 h-24 rounded-lg overflow-hidden border-2 border-neutral-200">
                  <img
                    src={currentLogo}
                    alt="Логотип"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isPending}
                >
                  {currentLogo ? 'Изменить логотип' : 'Загрузить логотип'}
                </Button>
                {currentLogo && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleRemoveLogo}
                    disabled={isPending}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    Удалить логотип
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="p-3 bg-green-50 text-green-600 rounded-lg text-sm">
              Настройки успешно обновлены
            </div>
          )}

          {/* Submit Button */}
          <div>
            <Button
              type="submit"
              disabled={isPending || (
                name.trim() === organization.name && 
                !logoFile &&
                publicDescription === (organization.public_description || '') &&
                telegramGroupLink === (organization.telegram_group_link || '')
              )}
            >
              {isPending ? 'Сохранение...' : 'Сохранить изменения'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

