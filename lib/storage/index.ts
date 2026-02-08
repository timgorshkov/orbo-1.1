/**
 * Storage Abstraction Layer - Entry Point
 * 
 * Единый интерфейс для работы с файловым хранилищем.
 * Переключение между провайдерами через env переменную STORAGE_PROVIDER.
 * 
 * Использование:
 * ```typescript
 * import { createStorage } from '@/lib/storage';
 * 
 * const storage = createStorage();
 * 
 * // Загрузка файла
 * await storage.upload('materials', 'logos/org-123.jpg', fileBuffer, {
 *   contentType: 'image/jpeg',
 *   upsert: true
 * });
 * 
 * // Получение публичного URL
 * const url = storage.getPublicUrl('materials', 'logos/org-123.jpg');
 * 
 * // Удаление файла
 * await storage.delete('materials', 'logos/org-123.jpg');
 * ```
 */

import type { StorageProvider, StorageProviderType } from './types';
import { createS3Storage, createSelectelStorage, S3StorageProvider } from './s3-storage';

// Реэкспорт типов
export type { 
  StorageProvider,
  StorageFile,
  StorageResult,
  StorageError,
  UploadOptions,
  UrlOptions,
  ListOptions,
  ImageTransform,
  StorageProviderType,
  StorageConfig
} from './types';

export { S3StorageProvider, createS3Storage, createSelectelStorage } from './s3-storage';

/**
 * Получить текущий провайдер хранилища из env
 */
export function getStorageProvider(): StorageProviderType {
  const provider = process.env.STORAGE_PROVIDER as StorageProviderType;
  return provider || 's3';
}

/**
 * Создаёт Storage Provider
 */
export function createStorage(): StorageProvider {
  const provider = getStorageProvider();
  
  switch (provider) {
    case 's3':
      // S3-совместимые хранилища (Selectel, AWS S3, MinIO и др.)
      return createS3Storage();
    
    case 'r2':
      // Cloudflare R2 использует S3 API
      return createS3Storage();
    
    case 'local':
      // TODO: Реализовать локальное хранилище (для разработки)
      throw new Error('Local storage provider not yet implemented');
    
    default:
      throw new Error(`Unknown storage provider: ${provider}. Supported: s3, r2, local`);
  }
}

// ============================================
// Хелперы для частых операций
// ============================================

/**
 * Получить имя bucket в зависимости от провайдера
 * - Supabase: несколько buckets ('materials', 'participant-photos', etc.)
 * - S3/Selectel: один bucket из env, логические разделы через path prefix
 */
export function getBucket(logicalBucket: string): string {
  const provider = getStorageProvider();
  
  if (provider === 's3' || provider === 'r2') {
    // Для S3 используем один bucket из env
    return process.env.SELECTEL_BUCKET || process.env.S3_BUCKET || 'orbo-storage';
  }
  
  // Для Supabase используем логический bucket напрямую
  return logicalBucket;
}

/**
 * Получить путь с учётом провайдера
 * - Supabase: path как есть
 * - S3: добавляем логический bucket как prefix
 */
export function getStoragePath(logicalBucket: string, path: string): string {
  const provider = getStorageProvider();
  
  if (provider === 's3' || provider === 'r2') {
    // Для S3: materials/org-logos/123.jpg -> materials/org-logos/123.jpg
    // Логический bucket становится частью пути
    return `${logicalBucket}/${path}`;
  }
  
  return path;
}

/** Логический bucket для материалов (логотипы, обложки, фото) */
export const BUCKET_MATERIALS = 'materials';

/** Логический bucket для файлов приложений */
export const BUCKET_APP_FILES = 'app-files';

/**
 * Загружает изображение организации
 */
export async function uploadOrgLogo(
  orgId: string,
  file: Buffer | Blob,
  contentType: string
): Promise<{ url: string; error: Error | null }> {
  const storage = createStorage();
  const ext = contentType.split('/')[1] || 'jpg';
  const path = `org-logos/${orgId}.${ext}`;
  
  const { data, error } = await storage.upload(BUCKET_MATERIALS, path, file, {
    contentType,
    upsert: true
  });
  
  if (error) {
    return { url: '', error: new Error(error.message) };
  }
  
  const url = storage.getPublicUrl(BUCKET_MATERIALS, path);
  return { url, error: null };
}

/**
 * Загружает обложку события
 */
export async function uploadEventCover(
  eventId: string,
  file: Buffer | Blob,
  contentType: string
): Promise<{ url: string; error: Error | null }> {
  const storage = createStorage();
  const ext = contentType.split('/')[1] || 'jpg';
  const path = `event-covers/${eventId}.${ext}`;
  
  const { data, error } = await storage.upload(BUCKET_MATERIALS, path, file, {
    contentType,
    upsert: true
  });
  
  if (error) {
    return { url: '', error: new Error(error.message) };
  }
  
  const url = storage.getPublicUrl(BUCKET_MATERIALS, path);
  return { url, error: null };
}

/**
 * Загружает фото участника
 */
export async function uploadParticipantPhoto(
  participantId: string,
  file: Buffer | Blob,
  contentType: string
): Promise<{ url: string; error: Error | null }> {
  const storage = createStorage();
  const ext = contentType.split('/')[1] || 'jpg';
  const path = `participant-photos/${participantId}.${ext}`;
  
  const { data, error } = await storage.upload(BUCKET_MATERIALS, path, file, {
    contentType,
    upsert: true
  });
  
  if (error) {
    return { url: '', error: new Error(error.message) };
  }
  
  const url = storage.getPublicUrl(BUCKET_MATERIALS, path);
  return { url, error: null };
}

/**
 * Удаляет файл по URL (извлекает bucket и path из URL)
 */
export async function deleteFileByUrl(url: string): Promise<{ error: Error | null }> {
  const storage = createStorage();
  
  // Извлекаем bucket и path из URL
  // Пример URL: https://xxx.supabase.co/storage/v1/object/public/materials/org-logos/123.jpg
  const match = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  
  if (!match) {
    return { error: new Error('Invalid storage URL format') };
  }
  
  const [, bucket, path] = match;
  
  const { error } = await storage.delete(bucket, path);
  
  if (error) {
    return { error: new Error(error.message) };
  }
  
  return { error: null };
}

