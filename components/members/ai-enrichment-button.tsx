'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface AIEnrichmentButtonProps {
  participantId: string;
  orgId: string;
  participantName: string;
  onEnrichmentComplete?: () => void;
}

/**
 * AI Enrichment Button for Owners/Admins
 * 
 * One-click AI analysis - no cost confirmation needed (costs tracked in admin panel).
 * Automatically refreshes page after analysis.
 * Compact design to be placed inline in section headers.
 */
export function AIEnrichmentButton({
  participantId,
  orgId,
  participantName,
  onEnrichmentComplete
}: AIEnrichmentButtonProps) {
  const router = useRouter();
  const [isEnriching, setIsEnriching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEnrich = async () => {
    setIsEnriching(true);
    setError(null);
    
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
        const errorData = await response.json();
        throw new Error(errorData.error || 'Enrichment failed');
      }
      
      // Call callback
      if (onEnrichmentComplete) {
        onEnrichmentComplete();
      }
      
      // Auto-refresh page to show results
      router.refresh();
    } catch (err) {
      console.error('Enrichment error:', err);
      setError(err instanceof Error ? err.message : 'Произошла ошибка');
    } finally {
      setIsEnriching(false);
    }
  };

  return (
    <div className="inline-flex flex-col items-end">
      <button
        onClick={handleEnrich}
        disabled={isEnriching}
        className="px-3 py-1.5 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium whitespace-nowrap flex items-center gap-2"
      >
        {isEnriching ? (
          <>
            <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div>
            <span>Анализ...</span>
          </>
        ) : (
          'Запустить анализ'
        )}
      </button>
      
      {error && (
        <p className="text-xs text-red-600 mt-1">❌ {error}</p>
      )}
    </div>
  );
}

