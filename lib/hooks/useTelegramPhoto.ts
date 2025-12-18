import { useState, useEffect } from 'react';

// Note: This is a client-side hook, but we can still use console for client-side logging
// In production, consider using a client-side logger if needed

/**
 * Хук для автоматической подгрузки фото участника из Telegram
 * Использует фото из Telegram только если у участника нет загруженного вручную фото
 */
export function useTelegramPhoto(participantId: string, currentPhotoUrl: string | null, tgUserId: number | null) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(currentPhotoUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Если фото уже есть, используем его
    if (currentPhotoUrl) {
      setPhotoUrl(currentPhotoUrl);
      return;
    }

    // Если нет tg_user_id, ничего не делаем
    if (!tgUserId) {
      return;
    }

    // Если фото нет, пытаемся загрузить из Telegram
    const syncPhoto = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(`/api/participants/${participantId}/sync-telegram-photo`, {
          method: 'POST'
        });

        const data = await response.json();

        if (data.success && data.photo_url) {
          setPhotoUrl(data.photo_url);
        } else if (data.message) {
          // Не выводим ошибку, если просто нет фото в Telegram
          console.log(`No Telegram photo available: ${data.message}`);
        }
      } catch (err: any) {
        console.error('Failed to sync Telegram photo:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    syncPhoto();
  }, [participantId, currentPhotoUrl, tgUserId]);

  return { photoUrl, isLoading, error };
}

