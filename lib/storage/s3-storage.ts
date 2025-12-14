/**
 * S3-Compatible Storage Provider
 * 
 * Работает с AWS S3, Selectel, Cloudflare R2, MinIO и другими S3-совместимыми хранилищами.
 * 
 * Для Selectel используйте:
 * - endpoint: https://s3.storage.selcloud.ru
 * - region: ru-1
 * - forcePathStyle: true
 */

import type { 
  StorageProvider, 
  StorageFile, 
  StorageResult, 
  StorageError,
  UploadOptions,
  UrlOptions,
  ListOptions 
} from './types';

// Динамический импорт AWS SDK для избежания ошибок при сборке если не используется
let S3Client: any;
let PutObjectCommand: any;
let GetObjectCommand: any;
let DeleteObjectCommand: any;
let DeleteObjectsCommand: any;
let ListObjectsV2Command: any;
let CopyObjectCommand: any;
let HeadObjectCommand: any;

async function initS3SDK() {
  if (!S3Client) {
    const s3Module = await import('@aws-sdk/client-s3');
    S3Client = s3Module.S3Client;
    PutObjectCommand = s3Module.PutObjectCommand;
    GetObjectCommand = s3Module.GetObjectCommand;
    DeleteObjectCommand = s3Module.DeleteObjectCommand;
    DeleteObjectsCommand = s3Module.DeleteObjectsCommand;
    ListObjectsV2Command = s3Module.ListObjectsV2Command;
    CopyObjectCommand = s3Module.CopyObjectCommand;
    HeadObjectCommand = s3Module.HeadObjectCommand;
  }
}

export interface S3StorageConfig {
  endpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
  publicUrlBase?: string;
}

/**
 * S3-Compatible Storage Provider
 */
export class S3StorageProvider implements StorageProvider {
  private client: any;
  private config: S3StorageConfig;
  private initialized = false;

  constructor(config: S3StorageConfig) {
    this.config = config;
  }

  private async ensureInitialized() {
    if (!this.initialized) {
      await initS3SDK();
      this.client = new S3Client({
        region: this.config.region,
        endpoint: this.config.endpoint,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
        },
        forcePathStyle: this.config.forcePathStyle ?? true,
      });
      this.initialized = true;
    }
  }

  async upload(
    bucket: string,
    path: string,
    file: Buffer | Blob | ArrayBuffer,
    options?: UploadOptions
  ): Promise<StorageResult<StorageFile>> {
    try {
      await this.ensureInitialized();
      
      let body: Buffer;
      if (file instanceof Blob) {
        body = Buffer.from(await file.arrayBuffer());
      } else if (file instanceof ArrayBuffer) {
        body = Buffer.from(file);
      } else {
        body = file;
      }

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: path,
        Body: body,
        ContentType: options?.contentType,
        CacheControl: options?.cacheControl,
        Metadata: options?.metadata,
      });

      await this.client.send(command);

      return {
        data: {
          name: path.split('/').pop() || '',
          bucket,
          path,
          size: body.length,
          contentType: options?.contentType,
        },
        error: null
      };
    } catch (error: any) {
      return {
        data: null,
        error: { message: error.message, code: error.Code }
      };
    }
  }

  async download(bucket: string, path: string): Promise<StorageResult<Blob>> {
    try {
      await this.ensureInitialized();
      
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: path,
      });

      const response = await this.client.send(command);
      const bodyContents = await response.Body?.transformToByteArray();
      
      if (!bodyContents) {
        return { data: null, error: { message: 'Empty response body' } };
      }

      const blob = new Blob([bodyContents], { type: response.ContentType });
      return { data: blob, error: null };
    } catch (error: any) {
      return {
        data: null,
        error: { message: error.message, code: error.Code }
      };
    }
  }

  async delete(bucket: string, paths: string | string[]): Promise<StorageResult<void>> {
    try {
      await this.ensureInitialized();
      
      const pathsArray = Array.isArray(paths) ? paths : [paths];

      if (pathsArray.length === 1) {
        const command = new DeleteObjectCommand({
          Bucket: bucket,
          Key: pathsArray[0],
        });
        await this.client.send(command);
      } else {
        const command = new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: pathsArray.map(Key => ({ Key })),
          },
        });
        await this.client.send(command);
      }

      return { data: null, error: null };
    } catch (error: any) {
      return {
        data: null,
        error: { message: error.message, code: error.Code }
      };
    }
  }

  async move(bucket: string, fromPath: string, toPath: string): Promise<StorageResult<void>> {
    try {
      // S3 не имеет нативного move, используем copy + delete
      const copyResult = await this.copy(bucket, fromPath, toPath);
      if (copyResult.error) return copyResult;

      return await this.delete(bucket, fromPath);
    } catch (error: any) {
      return {
        data: null,
        error: { message: error.message, code: error.Code }
      };
    }
  }

  async copy(bucket: string, fromPath: string, toPath: string): Promise<StorageResult<void>> {
    try {
      await this.ensureInitialized();
      
      const command = new CopyObjectCommand({
        Bucket: bucket,
        CopySource: `${bucket}/${fromPath}`,
        Key: toPath,
      });

      await this.client.send(command);
      return { data: null, error: null };
    } catch (error: any) {
      return {
        data: null,
        error: { message: error.message, code: error.Code }
      };
    }
  }

  getPublicUrl(bucket: string, path: string, options?: UrlOptions): string {
    if (this.config.publicUrlBase) {
      return `${this.config.publicUrlBase}/${bucket}/${path}`;
    }
    
    // Формируем URL в зависимости от endpoint
    if (this.config.endpoint) {
      const endpoint = this.config.endpoint.replace(/\/$/, '');
      if (this.config.forcePathStyle) {
        return `${endpoint}/${bucket}/${path}`;
      }
      // Virtual-hosted style
      const url = new URL(endpoint);
      return `${url.protocol}//${bucket}.${url.host}/${path}`;
    }
    
    // AWS S3 default
    return `https://${bucket}.s3.${this.config.region}.amazonaws.com/${path}`;
  }

  async createSignedUrl(
    bucket: string,
    path: string,
    expiresIn: number
  ): Promise<StorageResult<string>> {
    try {
      await this.ensureInitialized();
      
      // Для signed URLs нужен отдельный пакет @aws-sdk/s3-request-presigner
      // Здесь упрощённая реализация - возвращаем публичный URL
      console.warn('createSignedUrl: using public URL as fallback, install @aws-sdk/s3-request-presigner for proper signed URLs');
      
      return {
        data: this.getPublicUrl(bucket, path),
        error: null
      };
    } catch (error: any) {
      return {
        data: null,
        error: { message: error.message, code: error.Code }
      };
    }
  }

  async list(
    bucket: string,
    path?: string,
    options?: ListOptions
  ): Promise<StorageResult<StorageFile[]>> {
    try {
      await this.ensureInitialized();
      
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: path,
        MaxKeys: options?.limit,
      });

      const response = await this.client.send(command);

      const files: StorageFile[] = (response.Contents || []).map((item: any) => ({
        name: item.Key?.split('/').pop() || '',
        bucket,
        path: item.Key || '',
        size: item.Size,
        updatedAt: item.LastModified?.toISOString(),
      }));

      return { data: files, error: null };
    } catch (error: any) {
      return {
        data: null,
        error: { message: error.message, code: error.Code }
      };
    }
  }

  async exists(bucket: string, path: string): Promise<boolean> {
    try {
      await this.ensureInitialized();
      
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: path,
      });

      await this.client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }
}

/**
 * Создаёт S3 Storage Provider из environment variables
 */
export function createS3Storage(): S3StorageProvider {
  return new S3StorageProvider({
    endpoint: process.env.S3_ENDPOINT || process.env.SELECTEL_ENDPOINT,
    region: process.env.S3_REGION || process.env.SELECTEL_REGION || 'ru-1',
    accessKeyId: process.env.S3_ACCESS_KEY || process.env.SELECTEL_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY || process.env.SELECTEL_SECRET_KEY!,
    forcePathStyle: true,
    publicUrlBase: process.env.S3_PUBLIC_URL_BASE || process.env.SELECTEL_PUBLIC_URL_BASE,
  });
}

/**
 * Создаёт Selectel Storage Provider
 */
export function createSelectelStorage(): S3StorageProvider {
  return new S3StorageProvider({
    endpoint: 'https://s3.storage.selcloud.ru',
    region: 'ru-1',
    accessKeyId: process.env.SELECTEL_ACCESS_KEY!,
    secretAccessKey: process.env.SELECTEL_SECRET_KEY!,
    forcePathStyle: true,
    publicUrlBase: process.env.SELECTEL_PUBLIC_URL_BASE,
  });
}

