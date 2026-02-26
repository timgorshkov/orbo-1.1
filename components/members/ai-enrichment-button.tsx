'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface AIEnrichmentButtonProps {
  participantId: string;
  orgId: string;
  participantName: string;
  onEnrichmentComplete?: () => void;
}

export function AIEnrichmentButton({
  participantId,
  orgId,
  participantName,
  onEnrichmentComplete
}: AIEnrichmentButtonProps) {
  const router = useRouter();
  const [isEnriching, setIsEnriching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/ai/community-insights?orgId=${orgId}`)
      .then(r => r.json())
      .then(data => {
        if (data.credits) setCreditsRemaining(data.credits.remaining)
      })
      .catch(() => {})
  }, [orgId])

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
      
      const data = await response.json();

      if (!response.ok) {
        if (data.error === 'no_credits') {
          setError('AI-кредиты закончились. Напишите нам для подключения.');
          setCreditsRemaining(0);
        } else {
          setError(data.error || 'Ошибка анализа');
        }
        return;
      }
      
      if (creditsRemaining !== null && creditsRemaining > 0 && creditsRemaining !== -1) {
        setCreditsRemaining(creditsRemaining - 1);
      }

      if (onEnrichmentComplete) {
        onEnrichmentComplete();
      }
      
      router.refresh();
    } catch (err) {
      console.error('Enrichment error:', err);
      setError(err instanceof Error ? err.message : 'Произошла ошибка');
    } finally {
      setIsEnriching(false);
    }
  };

  const isUnlimited = creditsRemaining === -1;
  const noCredits = !isUnlimited && creditsRemaining !== null && creditsRemaining <= 0;

  return (
    <div className="inline-flex flex-col items-end">
      <button
        onClick={handleEnrich}
        disabled={isEnriching || noCredits}
        className="px-3 py-1.5 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium whitespace-nowrap flex items-center gap-2"
      >
        {isEnriching ? (
          <>
            <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div>
            <span>Анализ...</span>
          </>
        ) : noCredits ? (
          'Кредиты закончились'
        ) : (
          '✨ AI-анализ'
        )}
      </button>

      {!isUnlimited && creditsRemaining !== null && creditsRemaining > 0 && !isEnriching && (
        <p className="text-xs text-gray-400 mt-1">
          {creditsRemaining} кредит{creditsRemaining === 1 ? '' : creditsRemaining < 5 ? 'а' : 'ов'}
        </p>
      )}
      
      {error && (
        <p className="text-xs text-red-600 mt-1">{error}</p>
      )}
    </div>
  );
}
