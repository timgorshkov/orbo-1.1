import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { TelegramService } from '@/lib/services/telegramService';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';
import { createStorage, getBucket, getStoragePath } from '@/lib/storage';

const BUCKET_NAME = 'participant-photos';

/**
 * POST /api/participants/[participantId]/sync-telegram-photo
 * Синхронизирует фото профиля участника из Telegram
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ participantId: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/participants/[participantId]/sync-telegram-photo' });
  let participantId: string | undefined;
  try {
    const paramsData = await context.params;
    participantId = paramsData.participantId;
    
    // Проверяем авторизацию via unified auth
    const user = await getUnifiedUser();
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Используем admin client для запросов к БД
    const adminSupabase = createAdminServer();
    
    // Получаем информацию об участнике
    const { data: participant, error: participantError } = await adminSupabase
      .from('participants')
      .select('id, tg_user_id, org_id, photo_url, full_name')
      .eq('id', participantId)
      .is('merged_into', null)
      .single();
    
    if (participantError || !participant) {
      logger.error({ error: participantError?.message, participant_id: participantId }, 'Participant not found');
      return NextResponse.json(
        { error: 'Participant not found' },
        { status: 404 }
      );
    }
    
    // Если у участника уже есть загруженное фото, не перезаписываем
    if (participant.photo_url && participant.photo_url.includes('participant-photos')) {
      logger.info({ participant_id: participantId }, 'Participant already has a custom photo, skipping sync');
      return NextResponse.json({
        success: true,
        message: 'Participant already has a custom photo',
        photo_url: participant.photo_url
      });
    }
    
    // Проверяем, есть ли tg_user_id
    if (!participant.tg_user_id) {
      return NextResponse.json(
        { error: 'Participant has no Telegram user ID' },
        { status: 400 }
      );
    }

    // Попробуем все доступные боты — пользователь мог взаимодействовать с любым из них
    // event-бот используется для MiniApp регистрации на мероприятия
    const botTypes: Array<'main' | 'notifications' | 'event'> = ['main', 'notifications', 'event'];
    let photosResponse: any = null;
    let workingBotType: string | null = null;
    let telegramService: TelegramService | null = null;
    
    for (const botType of botTypes) {
      try {
        telegramService = new TelegramService(botType);
        const response = await telegramService.getUserProfilePhotos(
          Number(participant.tg_user_id),
          0,
          1
        );
        
        if (response.ok && response.result.photos.length > 0) {
          photosResponse = response;
          workingBotType = botType;
          logger.debug({ bot_type: botType, tg_user_id: participant.tg_user_id }, 'Found photos using bot');
          break;
        }
      } catch (err) {
        // Продолжаем попытки с другими ботами
        logger.debug({ bot_type: botType, error: (err as Error).message }, 'Bot failed to get photos, trying next');
      }
    }
    
    try {
      if (!photosResponse || !photosResponse.result.photos.length) {
        logger.debug({ 
          tg_user_id: participant.tg_user_id, 
          participant_id: participantId,
          bots_tried: botTypes.length
        }, 'No profile photos found for user (privacy settings may restrict access)');
        return NextResponse.json({
          success: false,
          message: 'No profile photos found - user may have privacy restrictions'
        });
      }
      
      // Получаем наибольшее фото (последнее в массиве)
      const photos = photosResponse.result.photos[0];
      const largestPhoto = photos[photos.length - 1];
      
      // Получаем информацию о файле (используем бот, который нашёл фото)
      const fileResponse = await telegramService!.getFile(largestPhoto.file_id);
      
      if (!fileResponse.ok || !fileResponse.result.file_path) {
        logger.error({ file_response: fileResponse, participant_id: participantId }, 'Failed to get file info');
        return NextResponse.json({
          success: false,
          message: 'Failed to get file info'
        }, { status: 500 });
      }
      
      // Скачиваем файл
      const fileBuffer = await telegramService!.downloadFile(fileResponse.result.file_path);
      
      // Initialize storage provider (Selectel S3)
      const storage = createStorage();
      const bucket = getBucket(BUCKET_NAME);
      
      // Определяем расширение файла (обычно .jpg для Telegram)
      const fileExtension = fileResponse.result.file_path.split('.').pop() || 'jpg';
      const fileName = `${participantId}-telegram.${fileExtension}`;
      const filePath = getStoragePath(BUCKET_NAME, `${participant.org_id}/${fileName}`);
      
      // Загружаем файл в S3 Storage
      const { error: uploadError } = await storage.upload(
        bucket,
        filePath,
        fileBuffer,
        {
          contentType: `image/${fileExtension}`,
          cacheControl: 'public, max-age=31536000',
        }
      );
      
      if (uploadError) {
        logger.error({ error: uploadError.message, participant_id: participantId, org_id: participant.org_id }, 'Failed to upload photo to storage');
        return NextResponse.json({
          success: false,
          message: 'Failed to upload photo',
          error: uploadError.message
        }, { status: 500 });
      }
      
      // Получаем публичный URL
      const publicUrl = storage.getPublicUrl(bucket, filePath);
      
      // Обновляем photo_url участника
      const { error: updateError } = await adminSupabase
        .from('participants')
        .update({ 
          photo_url: publicUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', participantId);
      
      if (updateError) {
        logger.error({ error: updateError.message, participant_id: participantId }, 'Failed to update participant photo_url');
        return NextResponse.json({
          success: false,
          message: 'Failed to update participant',
          error: updateError.message
        }, { status: 500 });
      }
      
      logger.info({ 
        participant_id: participantId, 
        org_id: participant.org_id, 
        url: publicUrl,
        bot_used: workingBotType
      }, 'Successfully synced photo for participant');
      
      return NextResponse.json({
        success: true,
        photo_url: publicUrl,
        message: 'Photo synced successfully'
      });
      
    } catch (telegramError: any) {
      // Gracefully handle "user not found" errors (user was likely deleted or blocked the bot)
      const errorMessage = telegramError.message || String(telegramError);
      const isUserNotFound = 
        errorMessage.includes('user not found') ||
        errorMessage.includes('USER_DELETED') ||
        errorMessage.includes('bot was blocked');
      
      if (isUserNotFound) {
        logger.info({ tg_user_id: participant.tg_user_id, participant_id: participantId }, 'Telegram user not found (deleted or blocked bot)');
        // Return 200 (not an error from user's perspective)
        return NextResponse.json({
          success: false,
          message: 'Telegram user not found or has blocked the bot',
          skipped: true
        }, { status: 200 });
      }
      
      logger.error({ 
        error: telegramError.message || String(telegramError),
        stack: telegramError.stack,
        tg_user_id: participant.tg_user_id,
        participant_id: participantId
      }, 'Telegram API error');
      return NextResponse.json({
        success: false,
        message: 'Failed to fetch photo from Telegram',
        error: telegramError.message
      }, { status: 500 });
    }
    
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      participant_id: participantId || 'unknown'
    }, 'Error syncing Telegram photo');
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
