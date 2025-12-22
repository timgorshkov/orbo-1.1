/**
 * NextAuth.js v5 Configuration
 * 
 * Независимая от Supabase реализация OAuth авторизации.
 * Поддерживает: Google, Yandex
 * 
 * При входе через OAuth автоматически создаётся пользователь в Supabase,
 * чтобы работали foreign key constraints на таблицах (memberships и др.)
 * 
 * @see https://authjs.dev/getting-started/installation
 */

import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import type { NextAuthConfig } from 'next-auth';
import { createClient } from '@supabase/supabase-js';
import { createServiceLogger } from '@/lib/logger';

const logger = createServiceLogger('NextAuth');

// Admin client для создания пользователей в Supabase
const getSupabaseAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Находит или создаёт пользователя в Supabase по email
 * Возвращает Supabase user ID
 */
async function ensureSupabaseUser(email: string, name?: string | null, image?: string | null): Promise<string | null> {
  const adminSupabase = getSupabaseAdmin();
  
  try {
    // 1. Пробуем найти существующего пользователя через RPC
    const { data: existingUserId } = await adminSupabase.rpc('get_user_id_by_email', { 
      p_email: email 
    });
    
    if (existingUserId) {
      logger.debug({ email, supabase_user_id: existingUserId }, 'Found existing Supabase user');
      
      // Обновляем email_confirmed_at для существующих пользователей (OAuth гарантирует email)
      const { error: updateError } = await adminSupabase.auth.admin.updateUserById(existingUserId, {
        email_confirm: true,
        user_metadata: {
          full_name: name || undefined,
          avatar_url: image || undefined,
          last_oauth_login: new Date().toISOString()
        }
      });
      
      if (updateError) {
        logger.warn({ error: updateError.message, user_id: existingUserId }, 'Failed to update email_confirmed_at for OAuth user');
      } else {
        logger.debug({ user_id: existingUserId }, 'Updated email confirmation for OAuth user');
      }
      
      return existingUserId;
    }
    
    // 2. Создаём нового пользователя
    const tempPassword = `oauth_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    const { data: newUser, error: createError } = await adminSupabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: name,
        avatar_url: image,
        auth_provider: 'oauth'
      }
    });
    
    if (createError) {
      logger.error({ error: createError.message, email }, 'Failed to create Supabase user');
      return null;
    }
    
    logger.info({ email, supabase_user_id: newUser.user.id }, 'Created new Supabase user for OAuth');
    
    return newUser.user.id;
    
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      email 
    }, 'Error in ensureSupabaseUser');
    return null;
  }
}

// Проверяем наличие credentials для провайдеров
const hasGoogleCredentials = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const hasYandexCredentials = !!(process.env.YANDEX_CLIENT_ID && process.env.YANDEX_CLIENT_SECRET);

// Логируем состояние конфигурации (только при запуске, не при билде)
if (process.env.NEXT_PHASE !== 'phase-production-build') {
  logger.info({
    google_configured: hasGoogleCredentials,
    yandex_configured: hasYandexCredentials,
    auth_secret_set: !!(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET),
    nextauth_url: process.env.NEXTAUTH_URL || process.env.AUTH_URL || 'NOT_SET',
  }, 'NextAuth configuration status');
}

// Собираем провайдеры динамически
const providers: NextAuthConfig['providers'] = [];

// Google Provider
if (hasGoogleCredentials) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          // select_account - показывает выбор аккаунта, но пропускает повторное подтверждение
          // для пользователей, которые уже давали согласие ранее
          prompt: 'select_account',
          access_type: 'offline',
          response_type: 'code',
        },
      },
    })
  );
}

// Custom Yandex provider (не встроен в next-auth)
if (hasYandexCredentials) {
  providers.push({
    id: 'yandex',
    name: 'Yandex',
    type: 'oauth' as const,
    authorization: {
      url: 'https://oauth.yandex.ru/authorize',
      params: {
        response_type: 'code',
        // Yandex использует свои собственные scopes, не OpenID Connect
        // login:email - доступ к email
        // login:info - доступ к базовой информации профиля
        scope: 'login:email login:info',
      },
    },
    token: {
      url: 'https://oauth.yandex.ru/token',
    },
    userinfo: {
      url: 'https://login.yandex.ru/info',
      async request({ tokens }: { tokens: any }) {
        const response = await fetch('https://login.yandex.ru/info?format=json', {
          headers: {
            Authorization: `OAuth ${tokens.access_token}`,
          },
        });
        return response.json();
      },
    },
    profile(profile: any) {
      return {
        id: profile.id,
        name: profile.display_name || profile.real_name || profile.login,
        email: profile.default_email || profile.emails?.[0],
        image: profile.default_avatar_id 
          ? `https://avatars.yandex.net/get-yapic/${profile.default_avatar_id}/islands-200`
          : null,
      };
    },
    clientId: process.env.YANDEX_CLIENT_ID!,
    clientSecret: process.env.YANDEX_CLIENT_SECRET!,
  });
}

export const authConfig: NextAuthConfig = {
  providers,

  // Важно для Docker: доверять host заголовкам
  trustHost: true,

  pages: {
    signIn: '/signin',
    error: '/signin',
    newUser: '/welcome',
  },

  callbacks: {
    async signIn({ user, account, profile }) {
      logger.info({
        user_id: user.id,
        email: user.email,
        provider: account?.provider,
      }, 'OAuth sign-in attempt');

      // Создаём/находим пользователя в Supabase для работы FK constraints
      if (user.email) {
        const supabaseUserId = await ensureSupabaseUser(user.email, user.name, user.image);
        if (supabaseUserId) {
          // Сохраняем Supabase user ID в user объект для использования в jwt callback
          // @ts-ignore - добавляем кастомное поле
          user.supabaseId = supabaseUserId;
        }
      }

      return true;
    },

    async jwt({ token, user, account, profile }) {
      // При первом входе сохраняем данные пользователя в токен
      if (user) {
        // Используем Supabase user ID если есть, иначе NextAuth ID
        // @ts-ignore - кастомное поле
        token.id = user.supabaseId || user.id;
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
        // @ts-ignore - сохраняем оригинальный NextAuth ID для справки
        token.nextAuthId = user.id;
      }

      if (account) {
        token.provider = account.provider;
        token.accessToken = account.access_token;
      }

      return token;
    },

    async session({ session, token }) {
      // Передаём данные из JWT в сессию
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.image = token.picture as string;
        // @ts-ignore - добавляем кастомные поля
        session.provider = token.provider;
      }

      return session;
    },

    async redirect({ url, baseUrl }) {
      // Если url начинается с baseUrl или это относительный путь - разрешаем
      if (url.startsWith(baseUrl)) return url;
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      
      // По умолчанию редиректим на /orgs
      return `${baseUrl}/orgs`;
    },
  },

  events: {
    async signIn({ user, account }) {
      logger.info({
        user_id: user.id,
        email: user.email,
        provider: account?.provider,
      }, 'User signed in via OAuth');
      
      // Ensure CRM record exists (non-blocking)
      // IMPORTANT: Use Supabase user ID, not NextAuth ID
      if (user.email) {
        const adminSupabase = getSupabaseAdmin();
        Promise.resolve(adminSupabase.rpc('get_user_id_by_email', { p_email: user.email }))
          .then(({ data: supabaseUserId }) => {
            if (supabaseUserId) {
              import('@/lib/services/weeekService').then(({ ensureCrmRecord }) => {
                ensureCrmRecord(supabaseUserId, user.email!, user.name).catch(() => {});
              }).catch(() => {});
            }
          })
          .catch(() => {});
      }
    },

    async signOut(message) {
      // message может быть { session } или { token } в зависимости от стратегии
      const token = 'token' in message ? message.token : null;
      logger.info({
        user_id: token?.id || token?.sub,
      }, 'User signed out');
    },

    async createUser({ user }) {
      logger.info({
        user_id: user.id,
        email: user.email,
      }, 'New user created via OAuth');
    },
  },

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  // Явная настройка cookies для production
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production' 
        ? '__Secure-authjs.session-token' 
        : 'authjs.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },

  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,

  debug: process.env.NODE_ENV === 'development',
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

// Экспортируем типы для использования в компонентах
export type { Session } from 'next-auth';

