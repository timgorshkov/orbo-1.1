import { useState, useEffect } from 'react';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getCacheKey(participantId: string) {
  return `tg_photo_${participantId}`;
}

function isRecentlyChecked(participantId: string): boolean {
  try {
    const cached = localStorage.getItem(getCacheKey(participantId));
    if (!cached) return false;
    return Date.now() - parseInt(cached, 10) < CACHE_TTL_MS;
  } catch {
    return false;
  }
}

function markChecked(participantId: string) {
  try {
    localStorage.setItem(getCacheKey(participantId), String(Date.now()));
  } catch { /* quota exceeded — non-critical */ }
}

/**
 * Хук для автоматической подгрузки фото участника из Telegram.
 * Кэширует отрицательный результат на 24ч чтобы не спамить Telegram API.
 */
function sanitizePhotoUrl(url: string | null): string | null {
  if (!url || url === 'none') return null;
  return url;
}

export function useTelegramPhoto(participantId: string, currentPhotoUrl: string | null, tgUserId: number | null) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(sanitizePhotoUrl(currentPhotoUrl));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const safeUrl = sanitizePhotoUrl(currentPhotoUrl);

    if (safeUrl) {
      setPhotoUrl(safeUrl);
      return;
    }

    if (!safeUrl && currentPhotoUrl) {
      setPhotoUrl(null);
      return;
    }

    if (!tgUserId) return;

    if (isRecentlyChecked(participantId)) return;

    const syncPhoto = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(`/api/participants/${participantId}/sync-telegram-photo`, {
          method: 'POST'
        });

        const data = await response.json();

        markChecked(participantId);

        if (data.success && data.photo_url) {
          setPhotoUrl(data.photo_url);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    syncPhoto();
  }, [participantId, currentPhotoUrl, tgUserId]);

  return { photoUrl, isLoading, error };
}

