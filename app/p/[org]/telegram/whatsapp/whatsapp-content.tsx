'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Upload, MessageSquare, Users, FileText, Clock, CheckCircle2, XCircle, Calendar, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

interface WhatsAppImport {
  id: string
  file_name: string
  group_name: string | null
  import_status: 'pending' | 'processing' | 'completed' | 'failed'
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
}

interface WhatsAppContentProps {
  orgId: string
  initialImports: WhatsAppImport[]
  totalParticipants: number
  totalMessages: number
}

export default function WhatsAppContent({
  orgId,
  initialImports,
  totalParticipants,
  totalMessages
}: WhatsAppContentProps) {
  const [imports] = useState<WhatsAppImport[]>(initialImports)
  
  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'd MMM yyyy, HH:mm', { locale: ru })
    } catch {
      return dateStr
    }
  }
  
  const formatDateRange = (start: string | null, end: string | null) => {
    if (!start || !end) return null
    try {
      const startDate = format(new Date(start), 'd MMM yyyy', { locale: ru })
      const endDate = format(new Date(end), 'd MMM yyyy', { locale: ru })
      return startDate === endDate ? startDate : `${startDate} — ${endDate}`
    } catch {
      return null
    }
  }
  
  return (
    <div className="grid gap-6">
      {/* Карточка импорта */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Импорт истории WhatsApp
          </CardTitle>
          <CardDescription>
            Импортируйте историю сообщений из групповых чатов WhatsApp для добавления участников и их активности
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h4 className="font-medium text-green-900 mb-3">📱 Как экспортировать историю чата:</h4>
            <ol className="text-sm text-green-800 space-y-2 list-decimal list-inside">
              <li>Откройте групповой чат в WhatsApp</li>
              <li>Нажмите <strong>⋮</strong> → <strong>Ещё</strong> → <strong>Экспорт чата</strong></li>
              <li>Выберите <strong>"Без медиа"</strong> для быстрого экспорта (получите .zip архив)</li>
              <li>Загрузите полученный <strong>.zip архив</strong> или <strong>.txt файл</strong></li>
            </ol>
            <p className="text-sm text-green-700 mt-3">
              💡 <strong>Совет:</strong> ZIP-архив содержит .vcf файлы с именами контактов — они будут использованы для улучшения имён участников
            </p>
          </div>
          
          <Link 
            href={`/p/${orgId}/telegram/whatsapp/import`}
            className="inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-medium bg-green-600 text-white hover:bg-green-700 gap-2"
          >
            <Upload className="w-4 h-4" />
            Начать импорт
          </Link>
        </CardContent>
      </Card>
      
      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <FileText className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{imports.length}</div>
                <div className="text-sm text-neutral-500">Импортов</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{totalParticipants}</div>
                <div className="text-sm text-neutral-500">Участников добавлено</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <MessageSquare className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{totalMessages.toLocaleString('ru')}</div>
                <div className="text-sm text-neutral-500">Сообщений импортировано</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* История импортов */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            История импортов
          </CardTitle>
        </CardHeader>
        <CardContent>
          {imports.length === 0 ? (
            <div className="text-center py-8 text-neutral-500">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
              <p>Пока нет импортов</p>
              <p className="text-sm">Импортируйте первую историю чата, чтобы начать</p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {imports.map((imp) => (
                <Link 
                  key={imp.id} 
                  href={`/p/${orgId}/telegram/whatsapp/${imp.id}`}
                  className="block py-4 first:pt-0 last:pb-0 hover:bg-neutral-50 -mx-4 px-4 rounded-lg transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {imp.import_status === 'completed' ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                        ) : imp.import_status === 'failed' ? (
                          <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        ) : (
                          <Clock className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                        )}
                        <span className="font-medium truncate">
                          {imp.group_name || 'WhatsApp чат'}
                        </span>
                      </div>
                      
                      <div className="text-sm text-neutral-500 space-y-1">
                        <div className="flex items-center gap-4 flex-wrap">
                          <span className="flex items-center gap-1">
                            <MessageSquare className="w-3.5 h-3.5" />
                            {imp.messages_imported.toLocaleString('ru')} сообщений
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            {imp.participants_created > 0 
                              ? `+${imp.participants_created} новых`
                              : `${imp.participants_total} участников`}
                          </span>
                        </div>
                        
                        {formatDateRange(imp.date_range_start, imp.date_range_end) && (
                          <div className="flex items-center gap-1 text-xs">
                            <Calendar className="w-3 h-3" />
                            <span>{formatDateRange(imp.date_range_start, imp.date_range_end)}</span>
                          </div>
                        )}
                        
                        {imp.error_message && (
                          <div className="text-red-500 text-xs">
                            Ошибка: {imp.error_message}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-neutral-400">
                        {formatDate(imp.created_at)}
                      </span>
                      <ChevronRight className="w-4 h-4 text-neutral-300" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

