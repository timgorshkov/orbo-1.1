'use client'

import { useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2, ArrowLeft, Archive, Users } from 'lucide-react'
import Link from 'next/link'

export default function WhatsAppImportPage() {
  const params = useParams()
  const router = useRouter()
  const orgId = params.org as string
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{
    messageCount: number
    participantCount: number
    dateRange: string
    isZip: boolean
  } | null>(null)
  
  const handleFileSelect = async (selectedFile: File) => {
    setError(null)
    setPreview(null)
    
    const isZip = selectedFile.name.toLowerCase().endsWith('.zip') || selectedFile.type === 'application/zip'
    const isTxt = selectedFile.name.toLowerCase().endsWith('.txt')
    
    if (!isZip && !isTxt) {
      setError('Пожалуйста, выберите файл .txt или .zip архив')
      return
    }
    
    setFile(selectedFile)
    
    if (isZip) {
      // For ZIP files, we show a placeholder preview
      // Full parsing happens on server
      setPreview({
        messageCount: 0,
        participantCount: 0,
        dateRange: 'Будет определено при импорте',
        isZip: true
      })
      console.log('[WhatsApp Import] ZIP file selected:', selectedFile.name, selectedFile.size, 'bytes')
      return
    }
    
    // Parse TXT file for preview
    try {
      const content = await selectedFile.text()
      const lines = content.split('\n').filter(line => line.trim())
      
      console.log('[WhatsApp Import] File loaded:', selectedFile.name)
      console.log('[WhatsApp Import] Total lines:', lines.length)
      console.log('[WhatsApp Import] First 5 lines sample:')
      lines.slice(0, 5).forEach((line, i) => console.log(`  Line ${i + 1}: ${line.substring(0, 100)}...`))
      
      // Patterns for different WhatsApp formats
      const patterns = [
        // Russian format: DD.MM.YYYY, HH:MM - Name: Message
        /^(\d{1,2}\.\d{1,2}\.\d{4}),\s*(\d{1,2}:\d{2})\s*-\s*([^:]+):\s*(.*)$/,
        // Alternative: [DD.MM.YYYY, HH:MM:SS] Name: Message
        /^\[(\d{1,2}[\.\/]\d{1,2}[\.\/]\d{2,4}),?\s*(\d{1,2}:\d{2}(?::\d{2})?)\]\s*([^:]+):\s*(.*)$/,
        // DD/MM/YYYY, HH:MM - Name: Message
        /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–]\s*([^:]+):\s*(.*)$/,
      ]
      
      const participants = new Set<string>()
      let messageCount = 0
      let minDate: Date | null = null
      let maxDate: Date | null = null
      let matchedPattern: number | null = null
      
      for (const line of lines) {
        let match: RegExpMatchArray | null = null
        
        for (let i = 0; i < patterns.length; i++) {
          match = line.match(patterns[i])
          if (match) {
            if (matchedPattern === null) {
              matchedPattern = i
              console.log(`[WhatsApp Import] Matched pattern ${i + 1}`)
            }
            break
          }
        }
        
        if (match) {
          messageCount++
          const participant = match[3].trim()
          
          const lowerParticipant = participant.toLowerCase()
          const isSystemMessage = 
            lowerParticipant.includes('создал') ||
            lowerParticipant.includes('добавил') ||
            lowerParticipant.includes('изменил') ||
            lowerParticipant.includes('вышел') ||
            lowerParticipant.includes('вступил') ||
            lowerParticipant.includes('присоединил') ||
            lowerParticipant.includes('покинул') ||
            lowerParticipant.includes('удалил') ||
            participant === 'Вы' ||
            participant.length > 100
          
          if (!isSystemMessage) {
            participants.add(participant)
          }
          
          const dateParts = match[1].replace(/\//g, '.').split('.')
          if (dateParts.length === 3) {
            let [day, month, year] = dateParts
            if (year.length === 2) {
              year = '20' + year
            }
            const date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`)
            if (!isNaN(date.getTime())) {
              if (!minDate || date < minDate) minDate = date
              if (!maxDate || date > maxDate) maxDate = date
            }
          }
        }
      }
      
      console.log(`[WhatsApp Import] Parsing result: ${messageCount} messages, ${participants.size} participants`)
      if (messageCount > 0 && participants.size > 0) {
        console.log('[WhatsApp Import] Sample participants:', Array.from(participants).slice(0, 5))
      }
      
      if (messageCount === 0) {
        console.error('[WhatsApp Import] No messages parsed. File format not recognized.')
        setError('Не удалось распознать сообщения в файле. Попробуйте загрузить ZIP-архив.')
        setFile(null)
        return
      }
      
      const formatDate = (date: Date) => date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
      
      setPreview({
        messageCount,
        participantCount: participants.size,
        dateRange: minDate && maxDate 
          ? `${formatDate(minDate)} — ${formatDate(maxDate)}`
          : 'Не определено',
        isZip: false
      })
      
    } catch (err) {
      console.error('Error parsing file:', err)
      setError('Ошибка при чтении файла')
      setFile(null)
    }
  }
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      handleFileSelect(droppedFile)
    }
  }
  
  const [importResult, setImportResult] = useState<{
    success: boolean
    groupName?: string
    stats: {
      messagesTotal: number
      messagesImported: number
      participantsCreated: number
      participantsExisting: number
      vcfContactsFound?: number
    }
  } | null>(null)
  
  const handleImport = async () => {
    if (!file) return
    
    setIsUploading(true)
    setError(null)
    setImportResult(null)
    
    try {
      const formData = new FormData()
      formData.append('file', file)
      
      console.log('[WhatsApp Import] Starting upload...')
      
      const response = await fetch(`/api/whatsapp/import?orgId=${orgId}`, {
        method: 'POST',
        body: formData
      })
      
      const result = await response.json()
      console.log('[WhatsApp Import] Response:', result)
      
      if (!response.ok) {
        throw new Error(result.error || 'Ошибка при импорте')
      }
      
      setImportResult({
        success: true,
        groupName: result.groupName,
        stats: result.stats
      })
      
    } catch (err: any) {
      console.error('[WhatsApp Import] Error:', err)
      setError(err.message || 'Произошла ошибка при импорте')
    } finally {
      setIsUploading(false)
    }
  }
  
  return (
    <div className="p-6">
      <div className="mb-6">
        <Link 
          href={`/p/${orgId}/telegram/whatsapp`}
          className="inline-flex items-center text-sm text-neutral-500 hover:text-neutral-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Назад к WhatsApp
        </Link>
        <h1 className="text-2xl font-semibold">Импорт истории WhatsApp</h1>
      </div>
      
      <div className="max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Загрузка файла</CardTitle>
            <CardDescription>
              Загрузите ZIP-архив или TXT-файл экспорта чата WhatsApp
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Drop zone */}
            <div
              className={`
                border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
                ${isDragging ? 'border-green-500 bg-green-50' : 'border-neutral-300 hover:border-green-400'}
                ${file ? 'border-green-500 bg-green-50' : ''}
              `}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.zip"
                className="hidden"
                onChange={(e) => {
                  const selectedFile = e.target.files?.[0]
                  if (selectedFile) handleFileSelect(selectedFile)
                }}
              />
              
              {file ? (
                <div className="space-y-2">
                  {file.name.toLowerCase().endsWith('.zip') ? (
                    <Archive className="w-12 h-12 mx-auto text-green-500" />
                  ) : (
                    <CheckCircle2 className="w-12 h-12 mx-auto text-green-500" />
                  )}
                  <div className="font-medium text-green-700">{file.name}</div>
                  <div className="text-sm text-green-600">
                    {(file.size / 1024).toFixed(1)} КБ
                    {file.name.toLowerCase().endsWith('.zip') && (
                      <span className="ml-2 px-2 py-0.5 bg-green-200 rounded text-xs">
                        ZIP-архив
                      </span>
                    )}
                  </div>
                  <button 
                    className="text-sm text-neutral-500 hover:text-neutral-700 underline"
                    onClick={(e) => {
                      e.stopPropagation()
                      setFile(null)
                      setPreview(null)
                    }}
                  >
                    Выбрать другой файл
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="w-12 h-12 mx-auto text-neutral-400" />
                  <div className="font-medium">Перетащите файл сюда</div>
                  <div className="text-sm text-neutral-500">
                    или нажмите для выбора
                  </div>
                  <div className="text-xs text-neutral-400">
                    Поддерживаемые форматы: <strong>.zip</strong> (рекомендуется) или <strong>.txt</strong>
                  </div>
                </div>
              )}
            </div>
            
            {/* Preview */}
            {preview && (
              <div className="bg-neutral-50 rounded-lg p-4 space-y-3">
                <h4 className="font-medium">
                  {preview.isZip ? '📦 ZIP-архив выбран' : 'Предварительный анализ:'}
                </h4>
                {preview.isZip ? (
                  <div className="text-sm text-neutral-600">
                    <p>Архив будет распакован на сервере.</p>
                    <p className="mt-2 flex items-center gap-2">
                      <Users className="w-4 h-4 text-blue-500" />
                      Имена контактов из VCF-файлов будут использованы для участников
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-green-600">{preview.messageCount}</div>
                      <div className="text-xs text-neutral-500">сообщений</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-blue-600">{preview.participantCount}</div>
                      <div className="text-xs text-neutral-500">участников</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-neutral-700">{preview.dateRange}</div>
                      <div className="text-xs text-neutral-500">период</div>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-700">{error}</div>
              </div>
            )}
            
            {/* Info */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
              <strong>💡 Рекомендуется загружать ZIP-архив:</strong>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li>Архив содержит VCF-файлы с именами контактов</li>
                <li>Участники будут созданы с реальными именами, а не номерами телефонов</li>
                <li>Повторный импорт не создаст дубликаты</li>
              </ul>
            </div>
            
            {/* Import result */}
            {importResult && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                <CheckCircle2 className="w-12 h-12 mx-auto text-green-500 mb-3" />
                <h3 className="text-lg font-semibold text-green-800 mb-2">Импорт завершён!</h3>
                {importResult.groupName && (
                  <p className="text-green-700 mb-4">Группа: {importResult.groupName}</p>
                )}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-2xl font-bold text-green-600">
                      {importResult.stats.messagesImported.toLocaleString('ru')}
                    </div>
                    <div className="text-neutral-500">сообщений импортировано</div>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-2xl font-bold text-blue-600">{importResult.stats.participantsCreated}</div>
                    <div className="text-neutral-500">участников создано</div>
                  </div>
                  {importResult.stats.participantsExisting > 0 && (
                    <div className="bg-white rounded-lg p-3">
                      <div className="text-lg font-bold text-neutral-600">{importResult.stats.participantsExisting}</div>
                      <div className="text-neutral-500">уже существовали</div>
                    </div>
                  )}
                  {importResult.stats.vcfContactsFound && importResult.stats.vcfContactsFound > 0 && (
                    <div className="bg-white rounded-lg p-3">
                      <div className="text-lg font-bold text-purple-600">{importResult.stats.vcfContactsFound}</div>
                      <div className="text-neutral-500">имён из VCF</div>
                    </div>
                  )}
                </div>
                <div className="mt-4 flex gap-3 justify-center">
                  <Link
                    href={`/p/${orgId}/members`}
                    className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    Перейти к участникам
                  </Link>
                  <button
                    onClick={() => {
                      setFile(null)
                      setPreview(null)
                      setImportResult(null)
                    }}
                    className="inline-flex items-center px-4 py-2 border border-neutral-300 rounded-lg hover:bg-neutral-50"
                  >
                    Импортировать ещё
                  </button>
                </div>
              </div>
            )}
            
            {/* Import button */}
            {!importResult && (
              <Button
                className="w-full"
                size="lg"
                disabled={!file || isUploading}
                onClick={handleImport}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Импортируем...
                  </>
                ) : preview?.isZip ? (
                  <>
                    <Archive className="w-4 h-4 mr-2" />
                    Импортировать архив
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4 mr-2" />
                    Импортировать {preview?.messageCount || 0} сообщений
                  </>
                )}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
