/**
 * Supabase Implementation of Auth Provider
 * 
 * Текущая реализация аутентификации через Supabase Auth.
 */

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createBrowserClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { 
  AuthProvider, 
  AuthUser, 
  AuthSession, 
  AuthResult, 
  AuthError,
  OtpOptions,
  OAuthOptions 
} from './types';

/**
 * Преобразует Supabase User в наш AuthUser
 */
function transformUser(supabaseUser: any): AuthUser | null {
  if (!supabaseUser) return null;
  
  return {
    id: supabaseUser.id,
    email: supabaseUser.email,
    phone: supabaseUser.phone,
    created_at: supabaseUser.created_at,
    updated_at: supabaseUser.updated_at,
    last_sign_in_at: supabaseUser.last_sign_in_at,
    user_metadata: supabaseUser.user_metadata,
    app_metadata: supabaseUser.app_metadata
  };
}

/**
 * Преобразует Supabase Session в нашу AuthSession
 */
function transformSession(supabaseSession: any): AuthSession | null {
  if (!supabaseSession) return null;
  
  return {
    access_token: supabaseSession.access_token,
    refresh_token: supabaseSession.refresh_token,
    expires_at: supabaseSession.expires_at,
    expires_in: supabaseSession.expires_in,
    token_type: supabaseSession.token_type || 'bearer',
    user: transformUser(supabaseSession.user)!
  };
}

/**
 * Преобразует Supabase Error в наш AuthError
 */
function transformError(error: any): AuthError | null {
  if (!error) return null;
  
  return {
    message: error.message,
    status: error.status,
    code: error.code
  };
}

/**
 * Supabase Server Auth Provider (для Server Components и Route Handlers)
 */
export class SupabaseServerAuthProvider implements AuthProvider {
  private getClient: () => Promise<ReturnType<typeof createServerClient>>;

  constructor() {
    this.getClient = async () => {
      const cookieStore = await cookies();
      
      return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            get: (name: string) => cookieStore.get(name)?.value,
            set: (name: string, value: string, options: CookieOptions) => {
              try {
                cookieStore.set({ name, value, ...options });
              } catch (error) {
                // Silently ignore in Server Components
              }
            },
            remove: (name: string, options: CookieOptions) => {
              try {
                cookieStore.set({ name, value: "", ...options });
              } catch (error) {
                // Silently ignore in Server Components
              }
            },
          }
        }
      );
    };
  }

  async getUser(): Promise<AuthResult<AuthUser>> {
    const client = await this.getClient();
    const { data, error } = await client.auth.getUser();
    
    return {
      data: transformUser(data?.user),
      error: transformError(error)
    };
  }

  async getSession(): Promise<AuthResult<AuthSession>> {
    const client = await this.getClient();
    const { data, error } = await client.auth.getSession();
    
    return {
      data: transformSession(data?.session),
      error: transformError(error)
    };
  }

  async signInWithOtp(options: OtpOptions): Promise<AuthResult<void>> {
    const client = await this.getClient();
    const { error } = await client.auth.signInWithOtp({
      email: options.email,
      phone: options.phone,
      options: {
        emailRedirectTo: options.redirectTo,
        shouldCreateUser: options.shouldCreateUser ?? true
      }
    });
    
    return {
      data: null,
      error: transformError(error)
    };
  }

  async verifyOtp(options: { 
    email?: string; 
    phone?: string; 
    token: string; 
    type: 'email' | 'sms' 
  }): Promise<AuthResult<AuthSession>> {
    const client = await this.getClient();
    const { data, error } = await client.auth.verifyOtp({
      email: options.email,
      phone: options.phone,
      token: options.token,
      type: options.type === 'email' ? 'email' : 'sms'
    });
    
    return {
      data: transformSession(data?.session),
      error: transformError(error)
    };
  }

  async exchangeCodeForSession(code: string): Promise<AuthResult<AuthSession>> {
    const client = await this.getClient();
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    
    return {
      data: transformSession(data?.session),
      error: transformError(error)
    };
  }

  async signInWithOAuth(options: OAuthOptions): Promise<AuthResult<{ url: string }>> {
    const client = await this.getClient();
    const { data, error } = await client.auth.signInWithOAuth({
      provider: options.provider as any,
      options: {
        redirectTo: options.redirectTo,
        scopes: options.scopes
      }
    });
    
    return {
      data: data?.url ? { url: data.url } : null,
      error: transformError(error)
    };
  }

  async signOut(): Promise<AuthResult<void>> {
    const client = await this.getClient();
    const { error } = await client.auth.signOut();
    
    return {
      data: null,
      error: transformError(error)
    };
  }

  async refreshSession(): Promise<AuthResult<AuthSession>> {
    const client = await this.getClient();
    const { data, error } = await client.auth.refreshSession();
    
    return {
      data: transformSession(data?.session),
      error: transformError(error)
    };
  }

  async updateUser(attributes: Partial<AuthUser>): Promise<AuthResult<AuthUser>> {
    const client = await this.getClient();
    const { data, error } = await client.auth.updateUser({
      email: attributes.email ?? undefined,
      phone: attributes.phone ?? undefined,
      data: attributes.user_metadata
    });
    
    return {
      data: transformUser(data?.user),
      error: transformError(error)
    };
  }
}

/**
 * Supabase Browser Auth Provider (для Client Components)
 */
export class SupabaseBrowserAuthProvider implements AuthProvider {
  private client: ReturnType<typeof createBrowserClient>;

  constructor() {
    this.client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }

  async getUser(): Promise<AuthResult<AuthUser>> {
    const { data, error } = await this.client.auth.getUser();
    
    return {
      data: transformUser(data?.user),
      error: transformError(error)
    };
  }

  async getSession(): Promise<AuthResult<AuthSession>> {
    const { data, error } = await this.client.auth.getSession();
    
    return {
      data: transformSession(data?.session),
      error: transformError(error)
    };
  }

  async signInWithOtp(options: OtpOptions): Promise<AuthResult<void>> {
    const { error } = await this.client.auth.signInWithOtp({
      email: options.email,
      phone: options.phone,
      options: {
        emailRedirectTo: options.redirectTo,
        shouldCreateUser: options.shouldCreateUser ?? true
      }
    });
    
    return {
      data: null,
      error: transformError(error)
    };
  }

  async verifyOtp(options: { 
    email?: string; 
    phone?: string; 
    token: string; 
    type: 'email' | 'sms' 
  }): Promise<AuthResult<AuthSession>> {
    const { data, error } = await this.client.auth.verifyOtp({
      email: options.email,
      phone: options.phone,
      token: options.token,
      type: options.type === 'email' ? 'email' : 'sms'
    });
    
    return {
      data: transformSession(data?.session),
      error: transformError(error)
    };
  }

  async exchangeCodeForSession(code: string): Promise<AuthResult<AuthSession>> {
    const { data, error } = await this.client.auth.exchangeCodeForSession(code);
    
    return {
      data: transformSession(data?.session),
      error: transformError(error)
    };
  }

  async signInWithOAuth(options: OAuthOptions): Promise<AuthResult<{ url: string }>> {
    const { data, error } = await this.client.auth.signInWithOAuth({
      provider: options.provider as any,
      options: {
        redirectTo: options.redirectTo,
        scopes: options.scopes
      }
    });
    
    return {
      data: data?.url ? { url: data.url } : null,
      error: transformError(error)
    };
  }

  async signOut(): Promise<AuthResult<void>> {
    const { error } = await this.client.auth.signOut();
    
    return {
      data: null,
      error: transformError(error)
    };
  }

  async refreshSession(): Promise<AuthResult<AuthSession>> {
    const { data, error } = await this.client.auth.refreshSession();
    
    return {
      data: transformSession(data?.session),
      error: transformError(error)
    };
  }

  async updateUser(attributes: Partial<AuthUser>): Promise<AuthResult<AuthUser>> {
    const { data, error } = await this.client.auth.updateUser({
      email: attributes.email ?? undefined,
      phone: attributes.phone ?? undefined,
      data: attributes.user_metadata
    });
    
    return {
      data: transformUser(data?.user),
      error: transformError(error)
    };
  }

  /**
   * Подписка на изменения auth состояния (только для browser)
   */
  onAuthStateChange(callback: (event: string, session: AuthSession | null) => void) {
    return this.client.auth.onAuthStateChange((event: string, session: any) => {
      callback(event, transformSession(session));
    });
  }
}

/**
 * Создаёт серверный Auth Provider
 */
export function createSupabaseServerAuth(): AuthProvider {
  return new SupabaseServerAuthProvider();
}

/**
 * Создаёт браузерный Auth Provider
 */
export function createSupabaseBrowserAuth(): SupabaseBrowserAuthProvider {
  return new SupabaseBrowserAuthProvider();
}

