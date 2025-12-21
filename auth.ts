/**
 * NextAuth.js v5 Configuration
 * 
 * Независимая от Supabase реализация OAuth авторизации.
 * Поддерживает: Google, Yandex
 * 
 * @see https://authjs.dev/getting-started/installation
 */

import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import type { NextAuthConfig } from 'next-auth';
import { createServiceLogger } from '@/lib/logger';

const logger = createServiceLogger('NextAuth');

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
          prompt: 'consent',
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

      // Можно добавить проверку домена email, блокировку пользователей и т.д.
      return true;
    },

    async jwt({ token, user, account, profile }) {
      // При первом входе сохраняем данные пользователя в токен
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
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

  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,

  debug: process.env.NODE_ENV === 'development',
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

// Экспортируем типы для использования в компонентах
export type { Session } from 'next-auth';

