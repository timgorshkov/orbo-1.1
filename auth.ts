/**
 * NextAuth.js v5 Configuration
 * 
 * Полностью независимая от Supabase реализация авторизации.
 * Использует локальную PostgreSQL для хранения пользователей.
 * 
 * Поддерживает: Google, Yandex OAuth + Email Magic Link
 * 
 * @see https://authjs.dev/getting-started/installation
 */

import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import type { NextAuthConfig } from 'next-auth'
import { PostgresAdapter } from '@/lib/auth/postgres-adapter'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('NextAuth')

// Проверяем наличие credentials для провайдеров
const hasGoogleCredentials = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
const hasYandexCredentials = !!(process.env.YANDEX_CLIENT_ID && process.env.YANDEX_CLIENT_SECRET)

// Логируем состояние конфигурации (только при запуске, не при билде)
if (process.env.NEXT_PHASE !== 'phase-production-build') {
  logger.info({
    google_configured: hasGoogleCredentials,
    yandex_configured: hasYandexCredentials,
    auth_secret_set: !!(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET),
    nextauth_url: process.env.NEXTAUTH_URL || process.env.AUTH_URL || 'NOT_SET',
  }, 'NextAuth configuration status')
}

// Собираем провайдеры динамически
const providers: NextAuthConfig['providers'] = []

// Google Provider
if (hasGoogleCredentials) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // Разрешаем связывать OAuth с существующими пользователями по email
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          prompt: 'select_account',
          access_type: 'offline',
          response_type: 'code',
        },
      },
    })
  )
}

// Custom Yandex provider
if (hasYandexCredentials) {
  providers.push({
    id: 'yandex',
    name: 'Yandex',
    type: 'oauth' as const,
    // Разрешаем связывать OAuth с существующими пользователями по email
    allowDangerousEmailAccountLinking: true,
    authorization: {
      url: 'https://oauth.yandex.ru/authorize',
      params: {
        response_type: 'code',
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
        })
        return response.json()
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
      }
    },
    clientId: process.env.YANDEX_CLIENT_ID!,
    clientSecret: process.env.YANDEX_CLIENT_SECRET!,
  })
}

// Email Magic Link обрабатывается напрямую в /api/auth/email/verify
// Не используем Credentials provider - создаём JWT сессию напрямую

export const authConfig: NextAuthConfig = {
  adapter: PostgresAdapter(),
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
      }, 'Sign-in attempt')

      return true
    },

    async jwt({ token, user, account, profile, trigger }) {
      // При первом входе ищем пользователя в БД по email
      if (user && user.email) {
        // Получаем user_id из нашей БД
        const db = (await import('@/lib/server/supabaseServer')).createAdminServer()
        const { data: dbUser } = await db
          .from('users')
          .select('id, name, image')
          .eq('email', user.email.toLowerCase())
          .single()
        
        if (dbUser) {
          // Используем ID из БД, а не из OAuth провайдера
          token.id = dbUser.id
          token.sub = dbUser.id
          token.name = dbUser.name || user.name
          token.picture = dbUser.image || user.image
          logger.debug({ 
            oauth_id: user.id, 
            db_id: dbUser.id, 
            email: user.email 
          }, 'Using database user ID instead of OAuth ID')
        } else {
          // Fallback на OAuth ID если пользователя нет в БД
          token.id = user.id
          token.name = user.name
          token.picture = user.image
        }
        token.email = user.email
      }

      if (account) {
        token.provider = account.provider
        token.accessToken = account.access_token
      }

      return token
    },

    async session({ session, token }) {
      // Передаём данные из JWT в сессию
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.email = token.email as string
        session.user.name = token.name as string
        session.user.image = token.picture as string
        // @ts-ignore - добавляем кастомные поля
        session.provider = token.provider
      }

      return session
    },

    async redirect({ url, baseUrl }) {
      // Если url начинается с baseUrl или это относительный путь - разрешаем
      if (url.startsWith(baseUrl)) return url
      if (url.startsWith('/')) return `${baseUrl}${url}`
      
      // По умолчанию редиректим на /orgs
      return `${baseUrl}/orgs`
    },
  },

  events: {
    async signIn({ user, account }) {
      logger.info({
        user_id: user.id,
        email: user.email,
        provider: account?.provider,
      }, 'User signed in')
      
      // Ensure CRM record exists (non-blocking)
      if (user.email && user.id) {
        import('@/lib/services/weeekService').then(({ ensureCrmRecord }) => {
          ensureCrmRecord(user.id!, user.email!, user.name).catch(() => {})
        }).catch(() => {})
      }
    },

    async signOut(message) {
      const token = 'token' in message ? message.token : null
      logger.info({
        user_id: token?.id || token?.sub,
      }, 'User signed out')
    },

    async createUser({ user }) {
      logger.info({
        user_id: user.id,
        email: user.email,
      }, 'New user created')
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
}

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)

// Экспортируем типы для использования в компонентах
export type { Session } from 'next-auth'
