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
        // Принудительно показывать выбор аккаунта при каждом входе
        force_confirm: 'yes',
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
        const data = await response.json()
        // Логируем в info чтобы видеть в production
        logger.info({ 
          yandex_login: data.login,
          has_default_email: !!data.default_email,
          default_email: data.default_email,
        }, 'Yandex userinfo response')
        return data
      },
    },
    profile(profile: any) {
      // Извлекаем email из различных полей Yandex API
      const email = profile.default_email || profile.emails?.[0] || `${profile.login}@yandex.ru`
      
      logger.info({ 
        yandex_id: profile.id,
        login: profile.login,
        default_email: profile.default_email,
        extracted_email: email,
      }, 'Yandex profile mapping')
      
      return {
        id: profile.id,
        name: profile.display_name || profile.real_name || profile.login,
        email: email,
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
        user_name: user.name,
        provider: account?.provider,
        profile_id: (profile as any)?.id,
        profile_email: (profile as any)?.email || (profile as any)?.default_email,
      }, 'Sign-in attempt')

      return true
    },

    async jwt({ token, user, account, profile, trigger }) {
      // При первом входе ищем пользователя в БД
      if (user || account) {
        const db = (await import('@/lib/server/supabaseServer')).createAdminServer()
        let dbUser = null
        
        // 1. Пробуем найти по email
        if (user?.email) {
          const { data } = await db
            .from('users')
            .select('id, email, name, image')
            .eq('email', user.email.toLowerCase())
            .single()
          dbUser = data
        }
        
        // 2. Если не нашли по email, ищем по user.id (UUID из adapter)
        if (!dbUser && user?.id) {
          // Проверяем что это похоже на UUID (36 символов с дефисами)
          const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)
          if (isUUID) {
            const { data } = await db
              .from('users')
              .select('id, email, name, image')
              .eq('id', user.id)
              .single()
            dbUser = data
          }
        }
        
        // 3. Если всё ещё не нашли, ищем через accounts table по provider
        if (!dbUser && account) {
          const { data: accountData } = await db
            .from('accounts')
            .select('user_id')
            .eq('provider', account.provider)
            .eq('provider_account_id', account.providerAccountId)
            .single()
          
          if (accountData?.user_id) {
            const { data } = await db
              .from('users')
              .select('id, email, name, image')
              .eq('id', accountData.user_id)
              .single()
            dbUser = data
            logger.debug({ 
              provider: account.provider, 
              provider_account_id: account.providerAccountId,
              user_id: accountData.user_id 
            }, 'Found user via accounts table')
          }
        }
        
        if (dbUser) {
          // Получаем email из OAuth профиля (user.email приходит из profile function)
          const profileEmail = user?.email?.toLowerCase() || null
          
          // Если email в БД пустой, но есть в профиле - обновляем БД
          if (!dbUser.email && profileEmail) {
            logger.info({ user_id: dbUser.id, new_email: profileEmail }, 'Updating user email from OAuth profile')
            await db.from('users').update({ 
              email: profileEmail,
              updated_at: new Date().toISOString()
            }).eq('id', dbUser.id)
            dbUser.email = profileEmail
          }
          
          // Если имя в БД пустое, но есть в профиле - обновляем БД
          if (!dbUser.name && user?.name) {
            await db.from('users').update({ 
              name: user.name,
              updated_at: new Date().toISOString()
            }).eq('id', dbUser.id)
            dbUser.name = user.name
          }
          
          // Используем данные из БД (с возможно обновлёнными полями)
          token.id = dbUser.id
          token.sub = dbUser.id
          token.email = dbUser.email || profileEmail
          token.name = dbUser.name || user?.name
          token.picture = dbUser.image || user?.image
          logger.debug({ 
            oauth_id: user?.id, 
            db_id: dbUser.id, 
            email: token.email 
          }, 'Using database user data')
        } else if (user) {
          // Fallback на данные из OAuth
          token.id = user.id
          token.email = user.email
          token.name = user.name
          token.picture = user.image
          logger.warn({ 
            user_id: user.id, 
            email: user.email,
            provider: account?.provider
          }, 'User not found in database, using OAuth data')
        }
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
      logger.debug({ url, baseUrl }, 'Redirect callback')
      
      // Если url начинается с baseUrl или это относительный путь - разрешаем
      if (url.startsWith(baseUrl)) return url
      if (url.startsWith('/')) return `${baseUrl}${url}`
      
      // Проверяем что не редиректим на сам signin (избегаем петли)
      if (url.includes('/signin') || url.includes('/api/auth')) {
        return `${baseUrl}/orgs`
      }
      
      // По умолчанию редиректим на /orgs
      return `${baseUrl}/orgs`
    },
  },

  events: {
    async signIn({ user, account, isNewUser }) {
      logger.info({
        user_id: user.id,
        email: user.email,
        provider: account?.provider,
        is_new_user: isNewUser,
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
      }, 'New OAuth user created')

      if (user.id) {
        import('@/lib/services/onboardingChainService').then(({ scheduleOnboardingChain }) => {
          scheduleOnboardingChain(user.id!, 'email').catch(() => {})
        }).catch(() => {})
      }
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
