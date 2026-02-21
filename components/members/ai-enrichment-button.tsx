'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBillingGate } from '@/lib/hooks/useBillingGate';
import UpgradeDialog from '@/components/billing/upgrade-dialog';

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
  const [showUpgrade, setShowUpgrade] = useState(false);
  const { status: billingStatus, showUpgradeForFeature } = useBillingGate(orgId);

  const handleEnrich = async () => {
    if (showUpgradeForFeature('ai_analysis')) {
      setShowUpgrade(true);
      return;
    }

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
        ) : showUpgradeForFeature('ai_analysis') ? (
          'PRO: Запустить анализ'
        ) : (
          'Запустить анализ'
        )}
      </button>
      
      {error && (
        <p className="text-xs text-red-600 mt-1">{error}</p>
      )}

      {billingStatus && (
        <UpgradeDialog
          isOpen={showUpgrade}
          onClose={() => setShowUpgrade(false)}
          reason="ai_feature"
          paymentUrl={billingStatus.paymentUrl}
          planName={billingStatus.plan?.name || 'Бесплатный'}
        />
      )}
    </div>
  );
}
