import { NextRequest, NextResponse } from 'next/server';
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer';
import { TelegramService } from '@/lib/services/telegramService';

/**
 * POST /api/participants/[participantId]/sync-telegram-photo
 * Синхронизирует фото профиля участника из Telegram
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ participantId: string }> }
) {
  try {
    const { participantId } = await context.params;
    
    // Проверяем авторизацию
    const supabase = await createClientServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
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
      console.error('Participant not found:', participantError);
      return NextResponse.json(
        { error: 'Participant not found' },
        { status: 404 }
      );
    }
    
    // Если у участника уже есть загруженное фото, не перезаписываем
    if (participant.photo_url && participant.photo_url.includes('participant-photos')) {
      console.log(`Participant ${participantId} already has a custom photo, skipping sync`);
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

    // Получаем фото профиля из Telegram
    const telegramService = new TelegramService('main');
    
    try {
      const photosResponse = await telegramService.getUserProfilePhotos(
        Number(participant.tg_user_id),
        0,
        1
      );
      
      if (!photosResponse.ok || !photosResponse.result.photos.length) {
        console.log(`No profile photos found for user ${participant.tg_user_id}`);
        return NextResponse.json({
          success: false,
          message: 'No profile photos found'
        });
      }
      
      // Получаем наибольшее фото (последнее в массиве)
      const photos = photosResponse.result.photos[0];
      const largestPhoto = photos[photos.length - 1];
      
      // Получаем информацию о файле
      const fileResponse = await telegramService.getFile(largestPhoto.file_id);
      
      if (!fileResponse.ok || !fileResponse.result.file_path) {
        console.error('Failed to get file info:', fileResponse);
        return NextResponse.json({
          success: false,
          message: 'Failed to get file info'
        }, { status: 500 });
      }
      
      // Скачиваем файл
      const fileBuffer = await telegramService.downloadFile(fileResponse.result.file_path);
      
      // Определяем расширение файла (обычно .jpg для Telegram)
      const fileExtension = fileResponse.result.file_path.split('.').pop() || 'jpg';
      const fileName = `${participant.org_id}/${participantId}-telegram.${fileExtension}`;
      
      // Загружаем файл в Supabase Storage
      const { data: uploadData, error: uploadError } = await adminSupabase.storage
        .from('participant-photos')
        .upload(fileName, fileBuffer, {
          contentType: `image/${fileExtension}`,
          upsert: true
        });
      
      if (uploadError) {
        console.error('Failed to upload photo to storage:', uploadError);
        return NextResponse.json({
          success: false,
          message: 'Failed to upload photo',
          error: uploadError.message
        }, { status: 500 });
      }
      
      // Получаем публичный URL
      const { data: { publicUrl } } = adminSupabase.storage
        .from('participant-photos')
        .getPublicUrl(fileName);
      
      // Обновляем photo_url участника
      const { error: updateError } = await adminSupabase
        .from('participants')
        .update({ 
          photo_url: publicUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', participantId);
      
      if (updateError) {
        console.error('Failed to update participant photo_url:', updateError);
        return NextResponse.json({
          success: false,
          message: 'Failed to update participant',
          error: updateError.message
        }, { status: 500 });
      }
      
      console.log(`Successfully synced photo for participant ${participantId}`);
      
      return NextResponse.json({
        success: true,
        photo_url: publicUrl,
        message: 'Photo synced successfully'
      });
      
    } catch (telegramError: any) {
      console.error('Telegram API error:', telegramError);
      return NextResponse.json({
        success: false,
        message: 'Failed to fetch photo from Telegram',
        error: telegramError.message
      }, { status: 500 });
    }
    
  } catch (error: any) {
    console.error('Error syncing Telegram photo:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

