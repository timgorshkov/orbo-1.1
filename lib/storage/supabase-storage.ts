/**
 * Supabase Implementation of Storage Provider
 * 
 * Текущая реализация файлового хранилища через Supabase Storage.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { 
  StorageProvider, 
  StorageFile, 
  StorageResult, 
  StorageError,
  UploadOptions,
  UrlOptions,
  ListOptions,
  ImageTransform
} from './types';

/**
 * Преобразует Supabase Storage ошибку в нашу StorageError
 */
function transformError(error: any): StorageError | null {
  if (!error) return null;
  
  return {
    message: error.message || 'Unknown storage error',
    code: error.name,
    statusCode: error.statusCode
  };
}

/**
 * Supabase реализация Storage Provider
 */
export class SupabaseStorageProvider implements StorageProvider {
  private client: SupabaseClient;
  private publicUrlBase: string;

  constructor(supabaseUrl?: string, serviceKey?: string) {
    this.client = createClient(
      supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey || process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
    
    this.publicUrlBase = `${supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public`;
  }

  async upload(
    bucket: string,
    path: string,
    file: Buffer | Blob | ArrayBuffer,
    options?: UploadOptions
  ): Promise<StorageResult<StorageFile>> {
    const { data, error } = await this.client.storage
      .from(bucket)
      .upload(path, file, {
        contentType: options?.contentType,
        upsert: options?.upsert ?? false,
        cacheControl: options?.cacheControl,
        // metadata не поддерживается напрямую в Supabase, но можно сохранить отдельно
      });
    
    if (error) {
      return { data: null, error: transformError(error) };
    }
    
    return {
      data: {
        name: data.path.split('/').pop() || '',
        bucket,
        path: data.path,
        // Дополнительные поля можно получить через list
      },
      error: null
    };
  }

  async download(bucket: string, path: string): Promise<StorageResult<Blob>> {
    const { data, error } = await this.client.storage
      .from(bucket)
      .download(path);
    
    return {
      data: data,
      error: transformError(error)
    };
  }

  async delete(bucket: string, paths: string | string[]): Promise<StorageResult<void>> {
    const pathsArray = Array.isArray(paths) ? paths : [paths];
    
    const { error } = await this.client.storage
      .from(bucket)
      .remove(pathsArray);
    
    return {
      data: null,
      error: transformError(error)
    };
  }

  async move(bucket: string, fromPath: string, toPath: string): Promise<StorageResult<void>> {
    const { error } = await this.client.storage
      .from(bucket)
      .move(fromPath, toPath);
    
    return {
      data: null,
      error: transformError(error)
    };
  }

  async copy(bucket: string, fromPath: string, toPath: string): Promise<StorageResult<void>> {
    const { error } = await this.client.storage
      .from(bucket)
      .copy(fromPath, toPath);
    
    return {
      data: null,
      error: transformError(error)
    };
  }

  getPublicUrl(bucket: string, path: string, options?: UrlOptions): string {
    const { data } = this.client.storage
      .from(bucket)
      .getPublicUrl(path, {
        transform: options?.transform as any,
        download: options?.download
      });
    
    return data.publicUrl;
  }

  async createSignedUrl(
    bucket: string,
    path: string,
    expiresIn: number
  ): Promise<StorageResult<string>> {
    const { data, error } = await this.client.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);
    
    return {
      data: data?.signedUrl || null,
      error: transformError(error)
    };
  }

  async list(
    bucket: string,
    path?: string,
    options?: ListOptions
  ): Promise<StorageResult<StorageFile[]>> {
    const { data, error } = await this.client.storage
      .from(bucket)
      .list(path || '', {
        limit: options?.limit,
        offset: options?.offset,
        sortBy: options?.sortBy,
        search: options?.search
      });
    
    if (error) {
      return { data: null, error: transformError(error) };
    }
    
    const files: StorageFile[] = (data || []).map(item => ({
      id: item.id,
      name: item.name,
      bucket,
      path: path ? `${path}/${item.name}` : item.name,
      size: item.metadata?.size,
      contentType: item.metadata?.mimetype,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      metadata: item.metadata
    }));
    
    return { data: files, error: null };
  }

  async exists(bucket: string, path: string): Promise<boolean> {
    const { data, error } = await this.client.storage
      .from(bucket)
      .list(path.split('/').slice(0, -1).join('/') || '', {
        search: path.split('/').pop()
      });
    
    if (error || !data) return false;
    
    const fileName = path.split('/').pop();
    return data.some(item => item.name === fileName);
  }

  /**
   * Получить оригинальный Supabase клиент для специфичных операций
   */
  getSupabaseClient(): SupabaseClient {
    return this.client;
  }
}

/**
 * Создаёт Supabase Storage Provider
 */
export function createSupabaseStorage(
  supabaseUrl?: string,
  serviceKey?: string
): SupabaseStorageProvider {
  return new SupabaseStorageProvider(supabaseUrl, serviceKey);
}

