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
import Credentials from 'next-auth/providers/credentials'
import type { NextAuthConfig } from 'next-auth'
import { PostgresAdapter } from '@/lib/auth/postgres-adapter'
import { createAdminServer } from '@/lib/server/supabaseServer'
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

// Email Magic Link через Credentials provider
// Фактическая верификация токена происходит в /api/auth/email/verify
providers.push(
  Credentials({
    id: 'email-token',
    name: 'Email',
    credentials: {
      email: { label: 'Email', type: 'email' },
      token: { label: 'Token', type: 'text' },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.token) {
        return null
      }

      const db = createAdminServer()
      const email = (credentials.email as string).toLowerCase()
      const token = credentials.token as string

      // Проверяем токен
      const { data: tokenData, error: tokenError } = await db
        .from('email_auth_tokens')
        .select('*')
        .eq('token', token)
        .eq('email', email)
        .eq('is_used', false)
        .single()

      if (tokenError || !tokenData) {
        logger.warn({ email }, 'Invalid email token')
        return null
      }

      // Проверяем срок действия
      if (new Date(tokenData.expires_at) < new Date()) {
        logger.warn({ email }, 'Email token expired')
        return null
      }

      // Помечаем токен как использованный
      await db
        .from('email_auth_tokens')
        .update({ is_used: true, used_at: new Date().toISOString() })
        .eq('id', tokenData.id)

      // Находим или создаём пользователя
      let { data: user } = await db
        .from('users')
        .select('*')
        .eq('email', email)
        .single()

      if (!user) {
        // Создаём нового пользователя
        const { data: newUser, error: createError } = await db
          .from('users')
          .insert({
            email,
            email_verified: new Date().toISOString(),
          })
          .select()
          .single()

        if (createError) {
          logger.error({ error: createError.message, email }, 'Failed to create user')
          return null
        }

        user = newUser
        logger.info({ email, user_id: user.id }, 'Created new user via email')
      } else {
        // Обновляем email_verified
        await db
          .from('users')
          .update({ 
            email_verified: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id)

        logger.info({ email, user_id: user.id }, 'User signed in via email')
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      }
    },
  })
)

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

    async jwt({ token, user, account, profile }) {
      // При первом входе сохраняем данные пользователя в токен
      if (user) {
        token.id = user.id
        token.email = user.email
        token.name = user.name
        token.picture = user.image
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
