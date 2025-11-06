'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { ParticipantDetailResult } from '@/lib/types/participant'
import { User, Mail, Phone, AtSign, Calendar, Edit2, Save, X, Plus, Trash2, Camera } from 'lucide-react'
import PhotoUploadModal from './photo-upload-modal'
import { AIEnrichmentButton } from './ai-enrichment-button'
import { EnrichedProfileDisplay } from './enriched-profile-display'

interface ParticipantProfileCardProps {
  orgId: string
  detail: ParticipantDetailResult
  onDetailUpdate?: (next?: ParticipantDetailResult) => void
  canEdit: boolean
  isAdmin: boolean
}

interface FieldState {
  full_name: string
  email: string
  phone: string
  bio: string
  notes: string
  custom_attributes: Record<string, any>
}

export default function ParticipantProfileCard({ 
  orgId, 
  detail, 
  onDetailUpdate,
  canEdit,
  isAdmin
}: ParticipantProfileCardProps) {
  const participant = detail.participant
  const [editing, setEditing] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [photoModalOpen, setPhotoModalOpen] = useState(false)
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState(participant.photo_url)
  
  // ✅ Синхронизируем currentPhotoUrl с participant.photo_url при изменении
  useEffect(() => {
    setCurrentPhotoUrl(participant.photo_url)
  }, [participant.photo_url])
  
  const [fields, setFields] = useState<FieldState>({
    full_name: participant.full_name || '',
    email: participant.email || '',
    phone: participant.phone || '',
    bio: participant.bio || '',
    notes: participant.notes || '',
    custom_attributes: participant.custom_attributes || {}
  })

  // Для редактирования custom attributes
  const [newAttrKey, setNewAttrKey] = useState('')
  const [newAttrValue, setNewAttrValue] = useState('')

  const handlePhotoUpdate = (newPhotoUrl: string | null) => {
    setCurrentPhotoUrl(newPhotoUrl)
    if (onDetailUpdate) {
      onDetailUpdate({
        ...detail,
        participant: {
          ...detail.participant,
          photo_url: newPhotoUrl
        }
      })
    }
  }

  const handleChange = (key: keyof FieldState, value: string) => {
    setFields(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const handleAddAttribute = () => {
    if (!newAttrKey.trim()) return
    
    setFields(prev => ({
      ...prev,
      custom_attributes: {
        ...prev.custom_attributes,
        [newAttrKey.trim()]: newAttrValue.trim()
      }
    }))
    
    setNewAttrKey('')
    setNewAttrValue('')
  }

  const handleRemoveAttribute = (key: string) => {
    setFields(prev => {
      const newAttrs = { ...prev.custom_attributes }
      delete newAttrs[key]
      return {
        ...prev,
        custom_attributes: newAttrs
      }
    })
  }

  const handleUpdateAttribute = (key: string, value: string) => {
    setFields(prev => ({
      ...prev,
      custom_attributes: {
        ...prev.custom_attributes,
        [key]: value
      }
    }))
  }

  const handleSubmit = async () => {
    setPending(true)
    setError(null)

    try {
      // Convert comma-separated strings to arrays before saving
      const customAttributes = { ...fields.custom_attributes };
      if (typeof customAttributes.offers === 'string') {
        customAttributes.offers = customAttributes.offers
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean);
      }
      if (typeof customAttributes.asks === 'string') {
        customAttributes.asks = customAttributes.asks
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean);
      }

      const response = await fetch(`/api/participants/${detail.requestedParticipantId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orgId,
          full_name: fields.full_name,
          email: fields.email,
          phone: fields.phone,
          bio: fields.bio,
          notes: fields.notes,
          custom_attributes: customAttributes
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Не удалось обновить профиль')
      }

      const data = await response.json()
      setEditing(false)
      if (data?.detail && onDetailUpdate) {
        onDetailUpdate(data.detail)
      }
    } catch (err: any) {
      setError(err.message || 'Не удалось обновить профиль')
    } finally {
      setPending(false)
    }
  }

  const handleCancel = () => {
    setEditing(false)
    setFields({
      full_name: participant.full_name || '',
      email: participant.email || '',
      phone: participant.phone || '',
      bio: participant.bio || '',
      notes: participant.notes || '',
      custom_attributes: participant.custom_attributes || {}
    })
    setError(null)
  }

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    })
  }

  return (
    <Card className="overflow-hidden">
      {/* Header with photo */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 h-32"></div>
      
      <CardContent className="relative pt-20 pb-6">
        {/* Profile Photo */}
        <div className="absolute -top-16 left-6 group">
          {currentPhotoUrl ? (
            <img
              src={currentPhotoUrl}
              alt={participant.full_name || 'User'}
              className="h-32 w-32 rounded-full border-4 border-white object-cover shadow-lg"
            />
          ) : (
            <div className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-white bg-gray-200 shadow-lg">
              <User className="h-16 w-16 text-gray-500" />
            </div>
          )}
          
          {/* Photo Upload Button */}
          {canEdit && (
            <button
              onClick={() => setPhotoModalOpen(true)}
              className="absolute bottom-0 right-0 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-blue-600 text-white shadow-lg transition-all hover:bg-blue-700 group-hover:scale-110"
              title="Изменить фото"
            >
              <Camera className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Edit Button */}
        {canEdit && !editing && (
          <div className="absolute top-6 right-6">
            <Button
              size={'sm' as const}
              onClick={() => setEditing(true)}
              className="gap-2"
            >
              <Edit2 className="h-4 w-4" />
              Редактировать
            </Button>
          </div>
        )}

        {/* Save/Cancel Buttons */}
        {editing && (
          <div className="absolute top-6 right-6 flex gap-2">
            <Button
              size={'sm' as const}
              variant="outline"
              onClick={handleCancel}
              disabled={pending}
              className="gap-2"
            >
              <X className="h-4 w-4" />
              Отмена
            </Button>
            <Button
              size={'sm' as const}
              onClick={handleSubmit}
              disabled={pending}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {pending ? 'Сохранение…' : 'Сохранить'}
            </Button>
          </div>
        )}

        <div className="space-y-6">
          {/* Name */}
          {editing ? (
            <div>
              <label className="text-sm font-medium text-gray-700">Полное имя</label>
              <Input
                value={fields.full_name}
                onChange={e => handleChange('full_name', e.target.value)}
                disabled={pending}
                className="mt-1"
                placeholder="Введите полное имя"
              />
            </div>
          ) : (
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {participant.full_name || 'Без имени'}
              </h1>
            </div>
          )}

          {/* Bio (краткое описание) */}
          {editing ? (
            <div>
              <label className="text-sm font-medium text-gray-700">Краткое описание</label>
              <Input
                value={fields.bio}
                onChange={e => handleChange('bio', e.target.value)}
                disabled={pending}
                className="mt-1"
                placeholder="Должность, интересы, специализация (до 60 символов)"
                maxLength={60}
              />
              <p className="mt-1 text-xs text-gray-500">
                {fields.bio.length}/60 символов
              </p>
            </div>
          ) : participant.bio ? (
            <div>
              <p className="text-lg text-gray-600">{participant.bio}</p>
            </div>
          ) : null}

          {/* Contact Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Telegram */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
              <AtSign className="h-5 w-5 text-blue-600" />
              <div className="flex-1">
                <div className="text-xs text-gray-500">Telegram</div>
                {participant.username ? (
                  <a
                    href={`https://t.me/${participant.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    @{participant.username}
                  </a>
                ) : (
                  <span className="text-sm text-gray-400">Не указан</span>
                )}
              </div>
            </div>

            {/* Email */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
              <Mail className="h-5 w-5 text-green-600" />
              <div className="flex-1">
                <div className="text-xs text-gray-500">Email</div>
                {editing ? (
                  <Input
                    type="email"
                    value={fields.email}
                    onChange={e => handleChange('email', e.target.value)}
                    disabled={pending}
                    className="mt-1 h-8"
                    placeholder="email@example.com"
                  />
                ) : participant.email ? (
                  <a
                    href={`mailto:${participant.email}`}
                    className="text-sm font-medium text-green-600 hover:text-green-800 hover:underline"
                  >
                    {participant.email}
                  </a>
                ) : (
                  <span className="text-sm text-gray-400">Не указан</span>
                )}
              </div>
            </div>

            {/* Phone */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
              <Phone className="h-5 w-5 text-purple-600" />
              <div className="flex-1">
                <div className="text-xs text-gray-500">Телефон</div>
                {editing ? (
                  <Input
                    type="tel"
                    value={fields.phone}
                    onChange={e => handleChange('phone', e.target.value)}
                    disabled={pending}
                    className="mt-1 h-8"
                    placeholder="+7 (XXX) XXX-XX-XX"
                  />
                ) : participant.phone ? (
                  <a
                    href={`tel:${participant.phone}`}
                    className="text-sm font-medium text-purple-600 hover:text-purple-800 hover:underline"
                  >
                    {participant.phone}
                  </a>
                ) : (
                  <span className="text-sm text-gray-400">Не указан</span>
                )}
              </div>
            </div>

            {/* Created At */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
              <Calendar className="h-5 w-5 text-orange-600" />
              <div className="flex-1">
                <div className="text-xs text-gray-500">Добавлен</div>
                <div className="text-sm font-medium text-gray-900">
                  {formatDate(participant.created_at)}
                </div>
              </div>
            </div>
          </div>

          {/* AI Enrichment Data (if available) */}
          {isAdmin && (
            <div className="mb-6">
              {participant.custom_attributes && Object.keys(participant.custom_attributes).length > 0 && !editing ? (
                <EnrichedProfileDisplay 
                  participant={detail.participant}
                  isAdmin={isAdmin}
                />
              ) : null}
              
              {/* Editable Goals & Offers (when editing) */}
              {editing && (
                <div className="space-y-4 p-6 border-2 border-blue-200 rounded-xl bg-blue-50">
                  <h3 className="text-lg font-semibold text-gray-900">Цели и Предложения</h3>
                  
                  {/* Goals */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">
                      Мои цели в сообществе
                    </label>
                    <Textarea
                      value={fields.custom_attributes.goals_self || ''}
                      onChange={e => setFields(prev => ({
                        ...prev,
                        custom_attributes: {
                          ...prev.custom_attributes,
                          goals_self: e.target.value
                        }
                      }))}
                      disabled={pending}
                      placeholder="Например: Найти партнеров для стартапа, Изучить новые технологии"
                      rows={3}
                    />
                  </div>
                  
                  {/* Offers */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">
                      Чем могу помочь (через запятую)
                    </label>
                    <Input
                      value={Array.isArray(fields.custom_attributes.offers) 
                        ? fields.custom_attributes.offers.join(', ')
                        : fields.custom_attributes.offers || ''}
                      onChange={e => setFields(prev => ({
                        ...prev,
                        custom_attributes: {
                          ...prev.custom_attributes,
                          offers: e.target.value
                        }
                      }))}
                      disabled={pending}
                      placeholder="Например: консультации по маркетингу, помощь с дизайном"
                    />
                  </div>
                  
                  {/* Asks */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">
                      Что мне нужно (через запятую)
                    </label>
                    <Input
                      value={Array.isArray(fields.custom_attributes.asks) 
                        ? fields.custom_attributes.asks.join(', ')
                        : fields.custom_attributes.asks || ''}
                      onChange={e => setFields(prev => ({
                        ...prev,
                        custom_attributes: {
                          ...prev.custom_attributes,
                          asks: e.target.value
                        }
                      }))}
                      disabled={pending}
                      placeholder="Например: инвестор, ментор по продажам"
                    />
                  </div>
                </div>
              )}
              
              {/* AI Analysis Button */}
              {!editing && (
                <div className="mt-4">
                  <AIEnrichmentButton 
                    participantId={participant.id}
                    orgId={orgId}
                    participantName={participant.full_name || participant.username || 'Участник'}
                    onEnrichmentComplete={() => {
                      // Refresh detail to show new enrichment data
                      if (onDetailUpdate) {
                        onDetailUpdate();
                      }
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Custom Attributes */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Дополнительная информация</h3>
            
            {/* Regular Traits from database (excluding merged) */}
            {detail.traits && detail.traits.filter(t => t.source !== 'merge').length > 0 && (
              <div className="space-y-2 mb-4">
                {detail.traits.filter(t => t.source !== 'merge').map((trait) => (
                  <div 
                    key={trait.id} 
                    className="flex items-start gap-3 p-3 rounded-lg bg-gray-50"
                  >
                    <div className="flex-1">
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        {trait.trait_key}
                      </div>
                      <div className="text-sm text-gray-900 mt-1">{trait.trait_value}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {/* User-editable custom attributes (excluding system/enrichment fields) */}
            {(() => {
              // System fields that shouldn't be edited manually (AI-generated or technical)
              const systemFields = [
                // AI-extracted fields
                'interests_keywords', 'recent_asks', 'city_inferred', 'city_confidence',
                'topics_discussed', 'behavioral_role', 'role_confidence', 'reaction_patterns',
                'communication_style',
                // User-defined fields (shown in "Goals & Offers" section)
                'goals_self', 'offers', 'asks', 'city_confirmed', 'bio_custom',
                // Technical/meta fields (should only be in logs)
                'last_enriched_at', 'enrichment_source', 'enrichment_version', 
                'cost_estimate_usd', 'tokens_used', 'cost_usd', 'analysis_date',
                'ai_analysis_cost', 'ai_analysis_tokens', // Additional AI cost fields
                // Event behavior (shown in separate section)
                'event_attendance'
              ];
              
              const userEditableAttrs = Object.entries(fields.custom_attributes)
                .filter(([key]) => !systemFields.includes(key));
              
              if (userEditableAttrs.length === 0 && (!detail.traits || detail.traits.filter(t => t.source !== 'merge').length === 0) && !editing) {
                return <p className="text-sm text-gray-500 italic">Нет дополнительных характеристик</p>;
              }
              
              return (
                <div className="space-y-2">
                  {userEditableAttrs.map(([key, value]) => (
                    <div key={key} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50">
                      <div className="flex-1">
                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                          {key}
                        </div>
                        {editing ? (
                          <Input
                            value={String(value)}
                            onChange={e => handleUpdateAttribute(key, e.target.value)}
                            disabled={pending}
                            className="mt-1"
                          />
                        ) : (
                          <div className="text-sm text-gray-900 mt-1">{String(value)}</div>
                        )}
                      </div>
                      {editing && (
                        <Button
                          size={'sm' as const}
                          variant="ghost"
                          onClick={() => handleRemoveAttribute(key)}
                          disabled={pending}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Add New Attribute */}
            {editing && (
              <div className="mt-4 p-4 rounded-lg border-2 border-dashed border-gray-300">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Добавить характеристику</h4>
                <div className="flex gap-2">
                  <Input
                    value={newAttrKey}
                    onChange={e => setNewAttrKey(e.target.value)}
                    placeholder="Название (например, 'Должность')"
                    disabled={pending}
                    className="flex-1"
                  />
                  <Input
                    value={newAttrValue}
                    onChange={e => setNewAttrValue(e.target.value)}
                    placeholder="Значение"
                    disabled={pending}
                    className="flex-1"
                  />
                  <Button
                    size={'sm' as const}
                    onClick={handleAddAttribute}
                    disabled={pending || !newAttrKey.trim()}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Добавить
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          {(editing || fields.notes) && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Заметки</h3>
              {editing ? (
                <Textarea
                  value={fields.notes}
                  onChange={e => handleChange('notes', e.target.value)}
                  disabled={pending}
                  rows={4}
                  placeholder="Добавьте заметки о участнике..."
                  className="w-full"
                />
              ) : (
                <div className="p-4 rounded-lg bg-gray-50 text-sm text-gray-700 whitespace-pre-wrap">
                  {fields.notes || <span className="text-gray-400 italic">Нет заметок</span>}
                </div>
              )}
            </div>
          )}

          {/* Groups - только для админа или самого участника */}
          {(isAdmin || canEdit) && detail.groups.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Telegram группы</h3>
              <div className="space-y-2">
                {detail.groups.map(group => (
                  <div 
                    key={group.tg_group_id} 
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
                  >
                    <div>
                      <div className="font-medium text-gray-900">
                        {group.title || `Группа ${group.tg_chat_id}`}
                      </div>
                      <div className="text-xs text-gray-500">ID: {group.tg_chat_id}</div>
                    </div>
                    <span 
                      className={`text-xs px-2 py-1 rounded-full ${
                        group.is_active 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {group.is_active ? 'Активен' : 'Неактивен'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Merged Traits - только для администраторов */}
          {isAdmin && detail.traits && detail.traits.filter(t => t.source === 'merge').length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">История объединений</h3>
              <p className="text-xs text-gray-500 mb-3">
                Значения полей из объединенных дубликатов профилей
              </p>
              <div className="space-y-2">
                {detail.traits.filter(t => t.source === 'merge').map((trait) => (
                  <div 
                    key={trait.id} 
                    className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0"
                  >
                    <div className="flex-1">
                      <div className="text-xs text-gray-500 uppercase tracking-wide">
                        {trait.trait_key}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">{trait.trait_value}</div>
                      {trait.metadata && trait.metadata.conflict_with && (
                        <div className="text-xs text-gray-400 mt-1">
                          Конфликтовало с: {trait.metadata.conflict_with}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>
      </CardContent>

      {/* Photo Upload Modal */}
      <PhotoUploadModal
        isOpen={photoModalOpen}
        onClose={() => setPhotoModalOpen(false)}
        currentPhotoUrl={currentPhotoUrl}
        participantId={detail.requestedParticipantId}
        orgId={orgId}
        onPhotoUpdate={handlePhotoUpdate}
      />
    </Card>
  )
}

