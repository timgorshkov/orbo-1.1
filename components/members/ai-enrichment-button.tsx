'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

interface AIEnrichmentButtonProps {
  participantId: string;
  orgId: string;
  participantName: string;
  onEnrichmentComplete?: () => void;
}

/**
 * AI Enrichment Button for Owners/Admins
 * 
 * Shows cost estimation and allows manual AI enrichment trigger.
 * Only visible to org owners/admins.
 */
export function AIEnrichmentButton({
  participantId,
  orgId,
  participantName,
  onEnrichmentComplete
}: AIEnrichmentButtonProps) {
  const [isEstimating, setIsEstimating] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [estimate, setEstimate] = useState<{
    messageCount: number;
    estimatedCostUsd: number;
    estimatedCostRub: number;
  } | null>(null);
  const [result, setResult] = useState<{
    success: boolean;
    summary?: any;
    error?: string;
  } | null>(null);

  const handleEstimate = async () => {
    setIsEstimating(true);
    setResult(null);
    
    try {
      const response = await fetch(
        `/api/participants/${participantId}/enrich-ai?orgId=${orgId}`,
        { method: 'GET' }
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to estimate');
      }
      
      const data = await response.json();
      setEstimate(data);
    } catch (error) {
      console.error('Estimation error:', error);
      alert(error instanceof Error ? error.message : 'Ошибка оценки стоимости');
    } finally {
      setIsEstimating(false);
    }
  };

  const handleEnrich = async () => {
    if (!estimate) return;
    
    // Confirm with user
    const confirmed = confirm(
      `Запустить AI-анализ для ${participantName}?\n\n` +
      `Сообщений: ${estimate.messageCount}\n` +
      `Стоимость: ~${estimate.estimatedCostRub.toFixed(2)} ₽ ($${estimate.estimatedCostUsd.toFixed(4)})\n\n` +
      `Это действие использует OpenAI API и не может быть отменено.`
    );
    
    if (!confirmed) return;
    
    setIsEnriching(true);
    setResult(null);
    
    try {
      const response = await fetch(
        `/api/participants/${participantId}/enrich-ai`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId,
            useAI: true,
            includeBehavior: true,
            includeReactions: true,
            daysBack: 90
          })
        }
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Enrichment failed');
      }
      
      const data = await response.json();
      setResult({ success: true, summary: data.summary });
      
      // Call callback
      if (onEnrichmentComplete) {
        onEnrichmentComplete();
      }
    } catch (error) {
      console.error('Enrichment error:', error);
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsEnriching(false);
    }
  };

  return (
    <Card className="p-4 bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="font-semibold text-gray-900">🤖 AI Enrichment</h4>
            <Badge variant="secondary" className="text-xs">Платная функция</Badge>
          </div>
          
          <p className="text-sm text-gray-600 mb-3">
            Используйте ChatGPT для автоматического анализа интересов, запросов и поведения участника.
          </p>
          
          {/* Cost Estimation */}
          {estimate && !isEnriching && !result && (
            <div className="bg-white rounded-md p-3 mb-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-gray-600">Сообщений:</span>
                  <span className="font-medium ml-2">{estimate.messageCount}</span>
                </div>
                <div>
                  <span className="text-gray-600">Стоимость:</span>
                  <span className="font-medium ml-2">
                    ~{estimate.estimatedCostRub.toFixed(2)} ₽
                  </span>
                  <span className="text-xs text-gray-500 ml-1">
                    (${estimate.estimatedCostUsd.toFixed(4)})
                  </span>
                </div>
              </div>
            </div>
          )}
          
          {/* Enrichment Result */}
          {result && (
            <div className={`rounded-md p-3 mb-3 text-sm ${
              result.success 
                ? 'bg-green-50 border border-green-200' 
                : 'bg-red-50 border border-red-200'
            }`}>
              {result.success ? (
                <div>
                  <p className="font-medium text-green-800 mb-2">✅ Анализ завершён!</p>
                  <div className="space-y-1 text-green-700">
                    {result.summary.interests > 0 && (
                      <p>• Найдено интересов: {result.summary.interests}</p>
                    )}
                    {result.summary.recentAsks > 0 && (
                      <p>• Актуальных запросов: {result.summary.recentAsks}</p>
                    )}
                    {result.summary.city && (
                      <p>• Город: {result.summary.city}</p>
                    )}
                    {result.summary.role && (
                      <p>• Роль: {result.summary.role} ({Math.round(result.summary.roleConfidence * 100)}%)</p>
                    )}
                  </div>
                  <p className="text-xs text-green-600 mt-2">
                    Обновите страницу для просмотра полных данных.
                  </p>
                </div>
              ) : (
                <div>
                  <p className="font-medium text-red-800 mb-1">❌ Ошибка</p>
                  <p className="text-red-700">{result.error}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Action Buttons */}
      <div className="flex gap-2">
        {!estimate && !isEnriching && !result && (
          <button
            onClick={handleEstimate}
            disabled={isEstimating}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          >
            {isEstimating ? 'Оценка...' : 'Оценить стоимость'}
          </button>
        )}
        
        {estimate && !isEnriching && !result && (
          <>
            <button
              onClick={handleEnrich}
              disabled={isEnriching || estimate.messageCount === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              Запустить AI-анализ
            </button>
            <button
              onClick={() => setEstimate(null)}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-sm"
            >
              Отмена
            </button>
          </>
        )}
        
        {isEnriching && (
          <div className="flex items-center gap-2 text-sm text-blue-600">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
            <span>Анализ в процессе...</span>
          </div>
        )}
        
        {result && (
          <button
            onClick={() => {
              setResult(null);
              setEstimate(null);
            }}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-sm"
          >
            Закрыть
          </button>
        )}
      </div>
      
      {/* Info Box */}
      {!result && (
        <div className="mt-3 pt-3 border-t border-purple-200">
          <p className="text-xs text-gray-600">
            <strong>ℹ️ Что анализируется:</strong> Интересы, запросы, город, роль в сообществе, реакции.
            Используется ChatGPT-4o-mini (~$0.0002-0.001 за участника).
          </p>
        </div>
      )}
    </Card>
  );
}

