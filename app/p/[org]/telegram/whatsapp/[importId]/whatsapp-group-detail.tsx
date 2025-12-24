'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { 
  MessageSquare, Users, Calendar, AlertTriangle, Settings, 
  Tag, Clock, FileText, ArrowLeft, CheckCircle, Loader2 
} from 'lucide-react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import Link from 'next/link'
import WhatsAppMessageHistory from './whatsapp-message-history'

interface WhatsAppImport {
  id: string
  org_id: string
  file_name: string
  group_name: string | null
  import_status: string
  messages_total: number
  messages_imported: number
  messages_duplicates: number
  participants_total: number
  participants_created: number
  participants_existing: number
  date_range_start: string | null
  date_range_end: string | null
  error_message: string | null
  created_at: string
  completed_at: string | null
  show_in_menu: boolean
  default_tag_id: string | null
  notes: string | null
  participant_tags: {
    id: string
    name: string
    color: string
  } | null
}

interface Tag {
  id: string
  name: string
  color: string
}

interface WhatsAppGroupDetailProps {
  orgId: string
  importData: WhatsAppImport
  availableTags: Tag[]
  isAdmin: boolean
}

export default function WhatsAppGroupDetail({
  orgId,
  importData,
  availableTags,
  isAdmin
}: WhatsAppGroupDetailProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'messages'>('overview')
  const [showInMenu, setShowInMenu] = useState(importData.show_in_menu || false)
  const [saving, setSaving] = useState(false)
  const [selectedTagId, setSelectedTagId] = useState(importData.default_tag_id || '')
  const [addingTag, setAddingTag] = useState(false)
  const [tagResult, setTagResult] = useState<{ success: boolean; count?: number; message?: string } | null>(null)
  
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    try {
      return format(new Date(dateStr), 'd MMMM yyyy', { locale: ru })
    } catch {
      return dateStr
    }
  }
  
  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '—'
    try {
      return format(new Date(dateStr), 'd MMM yyyy, HH:mm', { locale: ru })
    } catch {
      return dateStr
    }
  }
  
  const handleShowInMenuChange = async (checked: boolean) => {
    setShowInMenu(checked)
    setSaving(true)
    
    try {
      const res = await fetch(`/api/whatsapp/${importData.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ show_in_menu: checked })
      })
      
      if (!res.ok) {
        setShowInMenu(!checked) // Revert on error
      }
    } catch {
      setShowInMenu(!checked) // Revert on error
    } finally {
      setSaving(false)
    }
  }
  
  const handleAddTag = async () => {
    if (!selectedTagId) return
    
    setAddingTag(true)
    setTagResult(null)
    
    try {
      const res = await fetch(`/api/whatsapp/${importData.id}/add-tag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagId: selectedTagId })
      })
      
      const data = await res.json()
      
      if (res.ok && data.success && data.added > 0) {
        setTagResult({ success: true, count: data.added, message: data.tagName })
      } else if (data.error) {
        setTagResult({ success: false, message: data.error })
      } else if (data.added === 0) {
        setTagResult({ success: false, message: 'Не найдено участников для добавления тега' })
      } else {
        setTagResult({ success: false, message: 'Неизвестная ошибка' })
      }
    } catch (error) {
      setTagResult({ success: false, message: 'Ошибка соединения' })
    } finally {
      setAddingTag(false)
    }
  }
  
  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link 
          href={`/p/${orgId}/telegram/whatsapp`}
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Назад к импортам
        </Link>
        
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-3">
              <span className="text-2xl">💬</span>
              {importData.group_name || 'WhatsApp чат'}
            </h1>
            <p className="text-gray-500 mt-1">
              Импортировано {formatDateTime(importData.completed_at)}
            </p>
          </div>
          
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Только чтение
          </Badge>
        </div>
      </div>
      
      {/* Warning */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
        <div className="flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-amber-900">Это импортированная группа</h3>
            <p className="text-sm text-amber-700 mt-1">
              Данные были импортированы из экспорта WhatsApp и не обновляются автоматически. 
              Новые сообщения в исходной группе не появятся здесь.
            </p>
          </div>
        </div>
      </div>
      
      {/* Tabs */}
      <div className="flex gap-4 border-b mb-6">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 px-1 text-sm font-medium transition-colors relative ${
            activeTab === 'overview' 
              ? 'text-gray-900' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Settings className="w-4 h-4 inline mr-2" />
          Обзор
          {activeTab === 'overview' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-600" />
          )}
        </button>
        
        <button
          onClick={() => setActiveTab('messages')}
          className={`pb-3 px-1 text-sm font-medium transition-colors relative ${
            activeTab === 'messages' 
              ? 'text-gray-900' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <MessageSquare className="w-4 h-4 inline mr-2" />
          История сообщений
          {activeTab === 'messages' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-600" />
          )}
        </button>
      </div>
      
      {activeTab === 'overview' ? (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <MessageSquare className="w-4 h-4 text-purple-600" />
                  </div>
                  <div>
                    <div className="text-xl font-bold">{importData.messages_imported.toLocaleString('ru')}</div>
                    <div className="text-xs text-gray-500">Сообщений</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Users className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <div className="text-xl font-bold">{importData.participants_total}</div>
                    <div className="text-xs text-gray-500">Участников</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Calendar className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{formatDate(importData.date_range_start)}</div>
                    <div className="text-xs text-gray-500">Начало</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <Calendar className="w-4 h-4 text-orange-600" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{formatDate(importData.date_range_end)}</div>
                    <div className="text-xs text-gray-500">Конец</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Import Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Детали импорта
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-gray-500">Файл</dt>
                  <dd className="font-medium">{importData.file_name}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Статус</dt>
                  <dd className="font-medium flex items-center gap-1">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    Завершён
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Новых участников</dt>
                  <dd className="font-medium text-green-600">+{importData.participants_created}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Существующих</dt>
                  <dd className="font-medium">{importData.participants_existing}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Дубликатов сообщений</dt>
                  <dd className="font-medium text-gray-400">{importData.messages_duplicates}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Импортировано</dt>
                  <dd className="font-medium">{formatDateTime(importData.completed_at)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
          
          {/* Settings */}
          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  Настройки
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Show in Menu */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Показывать в меню</div>
                    <div className="text-sm text-gray-500">
                      Группа появится в левом меню ниже Telegram-групп
                    </div>
                  </div>
                  <Switch
                    checked={showInMenu}
                    onCheckedChange={handleShowInMenuChange}
                    disabled={saving}
                  />
                </div>
                
                {/* Add Tag */}
                <div className="pt-4 border-t">
                  <div className="font-medium mb-2 flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    Добавить тег всем участникам
                  </div>
                  <div className="text-sm text-gray-500 mb-3">
                    Выберите тег, который будет присвоен всем {importData.participants_total} участникам этого импорта
                  </div>
                  
                  <div className="flex gap-3">
                    <select
                      value={selectedTagId}
                      onChange={(e) => setSelectedTagId(e.target.value)}
                      className="flex-1 px-3 py-2 border rounded-lg text-sm"
                    >
                      <option value="">Выберите тег...</option>
                      {availableTags.map(tag => (
                        <option key={tag.id} value={tag.id}>
                          {tag.name}
                        </option>
                      ))}
                    </select>
                    
                    <Button
                      onClick={handleAddTag}
                      disabled={!selectedTagId || addingTag}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {addingTag ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Применить'
                      )}
                    </Button>
                  </div>
                  
                  {tagResult && (
                    <div className={`mt-3 text-sm p-3 rounded-lg ${
                      tagResult.success 
                        ? 'bg-green-50 text-green-700' 
                        : 'bg-red-50 text-red-700'
                    }`}>
                      {tagResult.success 
                        ? `✓ Тег "${tagResult.message}" добавлен ${tagResult.count} участникам`
                        : `✗ ${tagResult.message}`
                      }
                    </div>
                  )}
                  
                  {importData.participant_tags && (
                    <div className="mt-3 text-sm text-gray-500">
                      Текущий тег импорта: 
                      <Badge 
                        variant="outline" 
                        className="ml-2"
                        style={{ 
                          backgroundColor: `${importData.participant_tags.color}20`,
                          borderColor: importData.participant_tags.color,
                          color: importData.participant_tags.color
                        }}
                      >
                        {importData.participant_tags.name}
                      </Badge>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <WhatsAppMessageHistory 
          importId={importData.id}
          groupName={importData.group_name || 'WhatsApp чат'}
        />
      )}
    </div>
  )
}

