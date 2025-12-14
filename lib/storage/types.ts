/**
 * Storage Abstraction Layer - Types
 * 
 * Определяет интерфейсы для абстракции работы с файловым хранилищем.
 * Позволяет переключаться между Supabase Storage, S3, R2 и другими.
 */

/**
 * Информация о загруженном файле
 */
export interface StorageFile {
  id?: string;
  name: string;
  bucket: string;
  path: string;
  size?: number;
  contentType?: string;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, any>;
}

/**
 * Результат операции с хранилищем
 */
export interface StorageResult<T = any> {
  data: T | null;
  error: StorageError | null;
}

/**
 * Ошибка хранилища
 */
export interface StorageError {
  message: string;
  code?: string;
  statusCode?: number;
}

/**
 * Опции загрузки файла
 */
export interface UploadOptions {
  /** MIME тип файла */
  contentType?: string;
  /** Перезаписать существующий файл */
  upsert?: boolean;
  /** Дополнительные метаданные */
  metadata?: Record<string, string>;
  /** Cache-Control заголовок */
  cacheControl?: string;
}

/**
 * Опции для получения URL
 */
export interface UrlOptions {
  /** Время жизни signed URL в секундах */
  expiresIn?: number;
  /** Трансформации изображения (resize, crop и т.д.) */
  transform?: ImageTransform;
  /** Принудительная загрузка вместо отображения */
  download?: boolean | string;
}

/**
 * Трансформации изображения
 */
export interface ImageTransform {
  width?: number;
  height?: number;
  resize?: 'cover' | 'contain' | 'fill';
  quality?: number;
  format?: 'origin' | 'avif' | 'webp';
}

/**
 * Опции для листинга файлов
 */
export interface ListOptions {
  /** Максимальное количество файлов */
  limit?: number;
  /** Смещение для пагинации */
  offset?: number;
  /** Поле для сортировки */
  sortBy?: { column: string; order: 'asc' | 'desc' };
  /** Поиск по имени */
  search?: string;
}

/**
 * Основной интерфейс провайдера хранилища
 */
export interface StorageProvider {
  /**
   * Загружает файл в хранилище
   */
  upload(
    bucket: string,
    path: string,
    file: Buffer | Blob | ArrayBuffer,
    options?: UploadOptions
  ): Promise<StorageResult<StorageFile>>;
  
  /**
   * Скачивает файл из хранилища
   */
  download(
    bucket: string,
    path: string
  ): Promise<StorageResult<Blob>>;
  
  /**
   * Удаляет файл(ы) из хранилища
   */
  delete(
    bucket: string,
    paths: string | string[]
  ): Promise<StorageResult<void>>;
  
  /**
   * Перемещает/переименовывает файл
   */
  move(
    bucket: string,
    fromPath: string,
    toPath: string
  ): Promise<StorageResult<void>>;
  
  /**
   * Копирует файл
   */
  copy(
    bucket: string,
    fromPath: string,
    toPath: string
  ): Promise<StorageResult<void>>;
  
  /**
   * Получает публичный URL файла
   */
  getPublicUrl(
    bucket: string,
    path: string,
    options?: UrlOptions
  ): string;
  
  /**
   * Создаёт signed URL для приватного файла
   */
  createSignedUrl(
    bucket: string,
    path: string,
    expiresIn: number
  ): Promise<StorageResult<string>>;
  
  /**
   * Получает список файлов в папке
   */
  list(
    bucket: string,
    path?: string,
    options?: ListOptions
  ): Promise<StorageResult<StorageFile[]>>;
  
  /**
   * Проверяет существование файла
   */
  exists?(
    bucket: string,
    path: string
  ): Promise<boolean>;
}

/**
 * Тип провайдера хранилища
 */
export type StorageProviderType = 'supabase' | 's3' | 'r2' | 'local';

/**
 * Конфигурация хранилища
 */
export interface StorageConfig {
  provider: StorageProviderType;
  
  // Supabase-specific
  supabaseUrl?: string;
  supabaseServiceKey?: string;
  
  // S3/R2-specific
  endpoint?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  
  // Common
  publicUrlBase?: string;
}

