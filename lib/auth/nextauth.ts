/**
 * NextAuth.js Implementation of Auth Provider
 * 
 * Реализация аутентификации через NextAuth.js v5.
 * Поддерживает:
 * - Email OTP (через Resend/Unisender)
 * - OAuth провайдеры (Google, GitHub и др.)
 * - Credentials (для Telegram)
 * 
 * ⚠️ STUB IMPLEMENTATION
 * Это заглушка для будущей миграции на NextAuth.
 * Для активации требуется:
 * 1. npm install next-auth@beta @auth/core
 * 2. Создать app/api/auth/[...nextauth]/route.ts
 * 3. Передать auth handlers в createNextAuthServerProvider()
 */

import type { 
  AuthProvider, 
  AuthUser, 
  AuthSession, 
  AuthResult, 
  OtpOptions,
  OAuthOptions 
} from './types';

// NextAuth v5 конфигурируется через NextAuth(config) который возвращает { auth, signIn, signOut }
// Эти функции должны быть переданы извне после настройки NextAuth
interface NextAuthHandlers {
  auth: () => Promise<any>;
  signIn: (provider: string, options?: any) => Promise<any>;
  signOut: (options?: any) => Promise<any>;
}

let handlers: NextAuthHandlers | null = null;

/**
 * Регистрирует handlers из NextAuth конфигурации
 * Вызывается после инициализации NextAuth в app/api/auth/[...nextauth]/route.ts
 */
export function registerNextAuthHandlers(h: NextAuthHandlers) {
  handlers = h;
}

function checkHandlers(): boolean {
  if (!handlers) {
    console.warn(
      '[NextAuth] Handlers not registered. ' +
      'Call registerNextAuthHandlers() from your NextAuth config.'
    );
    return false;
  }
  return true;
}

/**
 * Преобразует NextAuth Session в нашу AuthSession
 */
function transformSession(session: any): AuthSession | null {
  if (!session?.user) return null;
  
  return {
    access_token: session.accessToken || '',
    refresh_token: session.refreshToken,
    expires_at: session.expires ? Math.floor(new Date(session.expires).getTime() / 1000) : undefined,
    token_type: 'bearer',
    user: {
      id: session.user.id || session.user.email || '',
      email: session.user.email,
      user_metadata: {
        full_name: session.user.name,
        avatar_url: session.user.image,
      }
    }
  };
}

/**
 * NextAuth Server Auth Provider
 */
export class NextAuthServerProvider implements AuthProvider {
  async getUser(): Promise<AuthResult<AuthUser>> {
    try {
      if (!checkHandlers()) {
        return { data: null, error: { message: 'NextAuth not configured' } };
      }
      
      const session = await handlers!.auth();
      
      if (!session?.user) {
        return { data: null, error: null };
      }
      
      return {
        data: {
          id: session.user.id || session.user.email || '',
          email: session.user.email,
          user_metadata: {
            full_name: session.user.name,
            avatar_url: session.user.image,
          }
        },
        error: null
      };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  }

  async getSession(): Promise<AuthResult<AuthSession>> {
    try {
      if (!checkHandlers()) {
        return { data: null, error: { message: 'NextAuth not configured' } };
      }
      
      const session = await handlers!.auth();
      return { data: transformSession(session), error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  }

  async signInWithOtp(options: OtpOptions): Promise<AuthResult<void>> {
    try {
      if (!checkHandlers()) {
        return { data: null, error: { message: 'NextAuth not configured' } };
      }
      
      // NextAuth signIn для email provider
      await handlers!.signIn('email', { 
        email: options.email,
        redirect: false,
        callbackUrl: options.redirectTo 
      });
      
      return { data: null, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  }

  async verifyOtp(options: { 
    email?: string; 
    phone?: string; 
    token: string; 
    type: 'email' | 'sms' 
  }): Promise<AuthResult<AuthSession>> {
    // NextAuth обрабатывает верификацию через callback URL
    return { 
      data: null, 
      error: { message: 'Use NextAuth callback URL for OTP verification' } 
    };
  }

  async exchangeCodeForSession(code: string): Promise<AuthResult<AuthSession>> {
    // NextAuth обрабатывает это автоматически через callbacks
    return { 
      data: null, 
      error: { message: 'Use NextAuth callbacks for code exchange' } 
    };
  }

  async signInWithOAuth(options: OAuthOptions): Promise<AuthResult<{ url: string }>> {
    try {
      if (!checkHandlers()) {
        return { data: null, error: { message: 'NextAuth not configured' } };
      }
      
      // NextAuth signIn для OAuth provider
      const result = await handlers!.signIn(options.provider, { 
        redirect: false,
        callbackUrl: options.redirectTo 
      });
      
      return { 
        data: result?.url ? { url: result.url } : null, 
        error: null 
      };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  }

  async signOut(): Promise<AuthResult<void>> {
    try {
      if (!checkHandlers()) {
        return { data: null, error: { message: 'NextAuth not configured' } };
      }
      
      await handlers!.signOut({ redirect: false });
      return { data: null, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  }

  async refreshSession(): Promise<AuthResult<AuthSession>> {
    // NextAuth обрабатывает refresh автоматически
    return this.getSession();
  }

  async updateUser(attributes: Partial<AuthUser>): Promise<AuthResult<AuthUser>> {
    // NextAuth не имеет встроенного метода обновления пользователя
    // Это должно обрабатываться через вашу БД
    return { 
      data: null, 
      error: { message: 'Use database to update user attributes' } 
    };
  }
}

/**
 * Создаёт NextAuth Server Provider
 * 
 * ⚠️ Перед использованием необходимо зарегистрировать handlers:
 * registerNextAuthHandlers({ auth, signIn, signOut })
 */
export function createNextAuthServerProvider(): NextAuthServerProvider {
  return new NextAuthServerProvider();
}

// ============================================
// Конфигурация NextAuth
// ============================================

/**
 * Пример конфигурации NextAuth для Orbo
 * 
 * Создайте файл app/api/auth/[...nextauth]/route.ts:
 * 
 * ```typescript
 * import NextAuth from 'next-auth';
 * import { nextAuthConfig } from '@/lib/auth/nextauth';
 * 
 * const handler = NextAuth(nextAuthConfig);
 * export { handler as GET, handler as POST };
 * ```
 */
export const nextAuthConfigExample = {
  providers: [
    // Email Provider (Magic Links через Resend)
    // EmailProvider({
    //   server: process.env.EMAIL_SERVER,
    //   from: process.env.EMAIL_FROM,
    //   // Или через Resend:
    //   // sendVerificationRequest: async ({ identifier, url }) => {
    //   //   await resend.emails.send({
    //   //     to: identifier,
    //   //     subject: 'Вход в Orbo',
    //   //     html: `<a href="${url}">Войти в Orbo</a>`,
    //   //   });
    //   // },
    // }),
    
    // Credentials Provider (для Telegram)
    // CredentialsProvider({
    //   name: 'Telegram',
    //   credentials: {
    //     code: { label: 'Код', type: 'text' },
    //   },
    //   async authorize(credentials) {
    //     // Проверяем код в БД
    //     const authCode = await db.from('telegram_auth_codes')
    //       .select('*')
    //       .eq('code', credentials?.code)
    //       .single();
    //     
    //     if (!authCode.data) return null;
    //     
    //     return {
    //       id: authCode.data.user_id,
    //       email: authCode.data.email,
    //     };
    //   },
    // }),
  ],
  
  callbacks: {
    // Добавляем user.id в session
    async session({ session, token }: { session: any; token: any }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
    
    // Добавляем user.id в JWT
    async jwt({ token, user }: { token: any; user: any }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
  },
  
  pages: {
    signIn: '/signin',
    error: '/signin',
  },
  
  session: {
    strategy: 'jwt' as const,
  },
  
  secret: process.env.NEXTAUTH_SECRET,
};

// ============================================
// Telegram Auth Integration для NextAuth
// ============================================

/**
 * Хелпер для аутентификации через Telegram в NextAuth
 * 
 * Использование:
 * 1. Пользователь получает код через Telegram бота
 * 2. Вводит код на сайте
 * 3. Вызывается этот метод для создания сессии
 */
export async function authenticateWithTelegramCode(
  code: string,
  db: any
): Promise<{ user: AuthUser | null; error: string | null }> {
  try {
    // Проверяем код в БД
    const { data: authCode, error } = await db
      .from('telegram_auth_codes')
      .select('*')
      .eq('code', code)
      .eq('verified', false)
      .gt('expires_at', new Date().toISOString())
      .single();
    
    if (error || !authCode) {
      return { user: null, error: 'Invalid or expired code' };
    }
    
    // Помечаем код как использованный
    await db
      .from('telegram_auth_codes')
      .update({ verified: true })
      .eq('code', code);
    
    // Возвращаем пользователя
    return {
      user: {
        id: authCode.user_id,
        email: authCode.email,
      },
      error: null
    };
  } catch (err: any) {
    return { user: null, error: err.message };
  }
}

