/**
 * Auth Abstraction Layer - Types
 * 
 * Определяет интерфейсы для абстракции аутентификации.
 * Позволяет переключаться между Supabase Auth, NextAuth, Lucia и другими.
 */

/**
 * Базовый пользователь системы
 */
export interface AuthUser {
  id: string;
  email?: string | null;
  phone?: string | null;
  created_at?: string;
  updated_at?: string;
  last_sign_in_at?: string | null;
  
  // Метаданные пользователя
  user_metadata?: {
    full_name?: string;
    avatar_url?: string;
    [key: string]: any;
  };
  
  // App-specific данные (хранятся отдельно в нашей БД)
  app_metadata?: {
    provider?: string;
    [key: string]: any;
  };
}

/**
 * Сессия пользователя
 */
export interface AuthSession {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  token_type: string;
  user: AuthUser;
}

/**
 * Результат аутентификации
 */
export interface AuthResult<T = any> {
  data: T | null;
  error: AuthError | null;
}

/**
 * Ошибка аутентификации
 */
export interface AuthError {
  message: string;
  status?: number;
  code?: string;
}

/**
 * Опции для OTP (email/phone)
 */
export interface OtpOptions {
  email?: string;
  phone?: string;
  redirectTo?: string;
  shouldCreateUser?: boolean;
}

/**
 * Опции для OAuth
 */
export interface OAuthOptions {
  provider: 'google' | 'github' | 'telegram' | string;
  redirectTo?: string;
  scopes?: string;
}

/**
 * Интерфейс провайдера аутентификации
 */
export interface AuthProvider {
  /**
   * Получить текущего пользователя
   */
  getUser(): Promise<AuthResult<AuthUser>>;
  
  /**
   * Получить текущую сессию
   */
  getSession(): Promise<AuthResult<AuthSession>>;
  
  /**
   * Вход через email OTP (magic link)
   */
  signInWithOtp(options: OtpOptions): Promise<AuthResult<void>>;
  
  /**
   * Верификация OTP кода
   */
  verifyOtp(options: { email?: string; phone?: string; token: string; type: 'email' | 'sms' }): Promise<AuthResult<AuthSession>>;
  
  /**
   * Обмен кода на сессию (PKCE flow)
   */
  exchangeCodeForSession(code: string): Promise<AuthResult<AuthSession>>;
  
  /**
   * Вход через OAuth провайдер
   */
  signInWithOAuth?(options: OAuthOptions): Promise<AuthResult<{ url: string }>>;
  
  /**
   * Выход из системы
   */
  signOut(): Promise<AuthResult<void>>;
  
  /**
   * Обновить сессию
   */
  refreshSession?(): Promise<AuthResult<AuthSession>>;
  
  /**
   * Обновить данные пользователя
   */
  updateUser?(attributes: Partial<AuthUser>): Promise<AuthResult<AuthUser>>;
}

/**
 * Тип провайдера аутентификации
 */
export type AuthProviderType = 'supabase' | 'nextauth' | 'lucia' | 'custom';

/**
 * Конфигурация аутентификации
 */
export interface AuthConfig {
  provider: AuthProviderType;
  
  // Supabase-specific
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  
  // NextAuth-specific  
  nextAuthUrl?: string;
  nextAuthSecret?: string;
  
  // Custom JWT
  jwtSecret?: string;
  jwtExpiresIn?: string;
}

