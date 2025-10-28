'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';

interface ParticipantMatch {
  importName: string;
  importUsername?: string;
  importMessageCount: number;
  importDateRange: {
    start: string;
    end: string;
  };
  existingParticipant?: {
    id: string;
    full_name: string;
    username?: string;
    currentMessageCount: number;
    last_activity_at?: string;
  };
  matchType: 'exact' | 'username' | 'fuzzy' | 'none';
  matchConfidence: number;
  recommendedAction: 'merge' | 'create_new';
}

interface PreviewData {
  filename: string;
  fileSize: number;
  stats: {
    totalMessages: number;
    uniqueAuthors: number;
    dateRange: {
      start: string;
      end: string;
    };
  };
  matches: ParticipantMatch[];
  matchStats: {
    exactMatches: number;
    fuzzyMatches: number;
    newParticipants: number;
  };
}

interface ImportHistoryProps {
  groupId: string;
  orgId: string;
}

type ImportDecision = {
  importName: string;
  importUsername?: string;
  action: 'merge' | 'create_new';
  targetParticipantId?: string;
};

export default function ImportHistory({ groupId, orgId }: ImportHistoryProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [decisions, setDecisions] = useState<Map<string, ImportDecision>>(new Map());

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setError(null);
    setSuccess(null);
    setPreview(null);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch(`/api/telegram/import-history/${groupId}/parse`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || errorData.error || 'Failed to parse file');
      }

      const result = await response.json();
      setPreview(result.data);

      // Инициализируем решения рекомендуемыми действиями
      const initialDecisions = new Map<string, ImportDecision>();
      result.data.matches.forEach((match: ParticipantMatch) => {
        const key = match.importUsername || match.importName;
        initialDecisions.set(key, {
          importName: match.importName,
          importUsername: match.importUsername,
          action: match.recommendedAction,
          targetParticipantId: match.existingParticipant?.id,
        });
      });
      setDecisions(initialDecisions);
    } catch (err: any) {
      setError(err.message || 'Failed to parse file');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/html': ['.html'],
    },
    maxSize: 2 * 1024 * 1024, // 2MB
    multiple: false,
  });

  const handleDecisionChange = (key: string, action: 'merge' | 'create_new') => {
    const match = preview?.matches.find(m => (m.importUsername || m.importName) === key);
    if (!match) return;

    const newDecisions = new Map(decisions);
    newDecisions.set(key, {
      importName: match.importName,
      importUsername: match.importUsername,
      action,
      targetParticipantId: action === 'merge' ? match.existingParticipant?.id : undefined,
    });
    setDecisions(newDecisions);
  };

  const handleBulkAction = (action: 'merge_all' | 'create_all') => {
    const newDecisions = new Map<string, ImportDecision>();
    preview?.matches.forEach(match => {
      const key = match.importUsername || match.importName;
      newDecisions.set(key, {
        importName: match.importName,
        importUsername: match.importUsername,
        action: action === 'merge_all' && match.existingParticipant ? 'merge' : 'create_new',
        targetParticipantId: action === 'merge_all' ? match.existingParticipant?.id : undefined,
      });
    });
    setDecisions(newDecisions);
  };

  const handleImport = async () => {
    if (!file || !preview) return;

    setImporting(true);
    setError(null);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('decisions', JSON.stringify(Array.from(decisions.values())));

      const response = await fetch(`/api/telegram/import-history/${groupId}/import`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || errorData.error || 'Import failed');
      }

      const result = await response.json();
      setSuccess(
        `Импортировано ${result.data.importedMessages} сообщений, ` +
        `создано ${result.data.newParticipants} новых участников, ` +
        `${result.data.matchedParticipants} участников связано с существующими.`
      );
      setPreview(null);
      setFile(null);
      setProgress(100);
    } catch (err: any) {
      setError(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Инструкция */}
      <Card>
        <CardHeader>
          <CardTitle>📤 Как экспортировать историю чата</CardTitle>
          <CardDescription>
            Следуйте инструкциям для экспорта истории из Telegram
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Откройте группу в <strong>Telegram Desktop</strong></li>
            <li>Нажмите <strong>⋮</strong> (три точки) → <strong>Export chat history</strong></li>
            <li>Выберите формат: <strong>HTML</strong></li>
            <li className="text-amber-600 font-medium">
              ⚠️ Снимите галочки с медиа (фото, видео, файлы). Достаточно только текстовых сообщений!
            </li>
            <li>Нажмите <strong>Export</strong> и дождитесь завершения</li>
            <li>Загрузите полученный <code className="bg-neutral-100 px-2 py-1 rounded">messages.html</code> сюда</li>
          </ol>
          
          <Alert className="mt-4 bg-blue-50 border-blue-200">
            <AlertDescription className="text-sm text-blue-800">
              💡 <strong>Совет:</strong> Telegram автоматически разбивает большие экспорты на файлы &lt; 1MB. 
              Если получилось несколько файлов, загружайте их по одному. Система автоматически пропустит дубликаты.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Drag & Drop зона */}
      {!preview && (
        <Card>
          <CardHeader>
            <CardTitle>Загрузить файл истории</CardTitle>
            <CardDescription>
              Макс. размер: 2MB. Поддерживаются только HTML файлы.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              {...getRootProps()}
              className={`
                border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors
                ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-neutral-300 hover:border-neutral-400'}
                ${loading ? 'opacity-50 pointer-events-none' : ''}
              `}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center gap-3">
                <div className="text-5xl">📁</div>
                {loading ? (
                  <div className="space-y-2">
                    <p className="text-lg font-medium">Обработка файла...</p>
                    <div className="w-48 mx-auto">
                      <Progress value={33} className="h-2" />
                    </div>
                  </div>
                ) : isDragActive ? (
                  <p className="text-lg font-medium text-blue-600">Отпустите файл здесь</p>
                ) : (
                  <>
                    <p className="text-lg font-medium">
                      Перетащите HTML файл сюда или нажмите для выбора
                    </p>
                    <p className="text-sm text-neutral-500">
                      Принимаются файлы формата .html размером до 2MB
                    </p>
                  </>
                )}
              </div>
            </div>

            {error && (
              <Alert className="mt-4 bg-red-50 border-red-200">
                <AlertDescription className="text-red-800">
                  ❌ {error}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Preview и таблица участников */}
      {preview && !importing && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Статистика импорта</CardTitle>
              <CardDescription>
                Файл: {preview.filename} ({(preview.fileSize / 1024).toFixed(1)} KB)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-3xl font-bold text-blue-600">{preview.stats.totalMessages}</div>
                  <div className="text-sm text-neutral-600 mt-1">Сообщений</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-3xl font-bold text-green-600">{preview.matchStats.exactMatches}</div>
                  <div className="text-sm text-neutral-600 mt-1">Точных совпадений</div>
                </div>
                <div className="text-center p-4 bg-amber-50 rounded-lg">
                  <div className="text-3xl font-bold text-amber-600">{preview.matchStats.fuzzyMatches}</div>
                  <div className="text-sm text-neutral-600 mt-1">Похожих</div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <div className="text-3xl font-bold text-purple-600">{preview.matchStats.newParticipants}</div>
                  <div className="text-sm text-neutral-600 mt-1">Новых</div>
                </div>
              </div>

              <div className="mt-4 text-sm text-neutral-600">
                <p>
                  <strong>Период:</strong>{' '}
                  {new Date(preview.stats.dateRange.start).toLocaleDateString('ru-RU')} -{' '}
                  {new Date(preview.stats.dateRange.end).toLocaleDateString('ru-RU')}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Групповые действия */}
          <Card>
            <CardHeader>
              <CardTitle>Групповые действия</CardTitle>
              <CardDescription>
                Примените действие ко всем участникам сразу
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => handleBulkAction('merge_all')}
              >
                Добавить к распознанным
              </Button>
              <Button
                variant="outline"
                onClick={() => handleBulkAction('create_all')}
              >
                Создать всех новыми
              </Button>
            </CardContent>
          </Card>

          {/* Таблица участников */}
          <Card>
            <CardHeader>
              <CardTitle>Участники ({preview.matches.length})</CardTitle>
              <CardDescription>
                Выберите действие для каждого участника
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 border-b">
                    <tr>
                      <th className="p-3 text-left font-medium">Из импорта</th>
                      <th className="p-3 text-left font-medium">Сообщений</th>
                      <th className="p-3 text-left font-medium">Существующий участник</th>
                      <th className="p-3 text-left font-medium">Уже есть</th>
                      <th className="p-3 text-left font-medium">Совпадение</th>
                      <th className="p-3 text-left font-medium">Действие</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.matches.map((match) => {
                      const key = match.importUsername || match.importName;
                      const decision = decisions.get(key);

                      return (
                        <tr key={key} className="border-b hover:bg-neutral-50">
                          <td className="p-3">
                            <div className="font-medium">{match.importName}</div>
                            {match.importUsername && (
                              <div className="text-xs text-neutral-500">@{match.importUsername}</div>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <span className="inline-block px-2 py-1 bg-blue-100 text-blue-700 rounded">
                              +{match.importMessageCount}
                            </span>
                          </td>
                          <td className="p-3">
                            {match.existingParticipant ? (
                              <div>
                                <div className="font-medium">{match.existingParticipant.full_name}</div>
                                {match.existingParticipant.username && (
                                  <div className="text-xs text-neutral-500">@{match.existingParticipant.username}</div>
                                )}
                              </div>
                            ) : (
                              <span className="text-neutral-400 italic">Не найден</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {match.existingParticipant ? (
                              <span className="text-neutral-600">{match.existingParticipant.currentMessageCount}</span>
                            ) : (
                              <span className="text-neutral-400">—</span>
                            )}
                          </td>
                          <td className="p-3">
                            {match.matchType !== 'none' ? (
                              <div className="flex items-center gap-1">
                                <span className={`
                                  inline-block px-2 py-1 rounded text-xs font-medium
                                  ${match.matchConfidence > 90 ? 'bg-green-100 text-green-700' : 
                                    match.matchConfidence > 70 ? 'bg-amber-100 text-amber-700' : 
                                    'bg-red-100 text-red-700'}
                                `}>
                                  {match.matchConfidence}%
                                </span>
                              </div>
                            ) : (
                              <span className="text-neutral-400 text-xs">—</span>
                            )}
                          </td>
                          <td className="p-3">
                            <select
                              value={decision?.action || 'create_new'}
                              onChange={(e) => handleDecisionChange(key, e.target.value as 'merge' | 'create_new')}
                              className="text-sm border rounded px-2 py-1"
                              disabled={!match.existingParticipant && decision?.action === 'merge'}
                            >
                              {match.existingParticipant && (
                                <option value="merge">Добавить к существующему</option>
                              )}
                              <option value="create_new">Создать нового</option>
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setPreview(null);
                    setFile(null);
                    setDecisions(new Map());
                  }}
                >
                  Отмена
                </Button>
                <Button onClick={handleImport}>
                  Импортировать {preview.stats.totalMessages} сообщений
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Прогресс импорта */}
      {importing && (
        <Card>
          <CardHeader>
            <CardTitle>Импортирование...</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={progress} className="h-2" />
            <p className="text-sm text-neutral-600 text-center">
              Пожалуйста, не закрывайте эту страницу
            </p>
          </CardContent>
        </Card>
      )}

      {/* Успех */}
      {success && !importing && (
        <Alert className="bg-green-50 border-green-200">
          <AlertDescription className="text-green-800">
            ✅ {success}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

