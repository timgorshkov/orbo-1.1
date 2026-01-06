/**
 * PostgreSQL Adapter for NextAuth.js
 * 
 * Custom adapter that works with our local PostgreSQL database.
 * Uses the pg client we already have configured.
 */

import type { Adapter, AdapterUser, AdapterAccount, AdapterSession, VerificationToken } from 'next-auth/adapters'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('PostgresAdapter')

export function PostgresAdapter(): Adapter {
  const db = createAdminServer()

  return {
    async createUser(user) {
      logger.debug({ email: user.email, name: user.name }, 'Creating user')
      
      // Сначала проверяем - может пользователь уже существует
      if (user.email) {
        const { data: existingUser } = await db
          .from('users')
          .select('*')
          .eq('email', user.email.toLowerCase())
          .single()
        
        if (existingUser) {
          logger.info({ user_id: existingUser.id, email: existingUser.email }, 'User already exists, returning existing')
          
          // Обновляем данные если нужно
          if (user.name && !existingUser.name) {
            await db.from('users').update({ name: user.name, updated_at: new Date().toISOString() }).eq('id', existingUser.id)
          }
          if (user.image && !existingUser.image) {
            await db.from('users').update({ image: user.image, updated_at: new Date().toISOString() }).eq('id', existingUser.id)
          }
          
          return {
            id: existingUser.id,
            email: existingUser.email!,
            name: existingUser.name || user.name,
            emailVerified: existingUser.email_verified ? new Date(existingUser.email_verified) : null,
            image: existingUser.image || user.image,
          }
        }
      }
      
      const { data, error } = await db
        .from('users')
        .insert({
          email: user.email?.toLowerCase(),
          name: user.name,
          email_verified: user.emailVerified?.toISOString(),
          image: user.image,
        })
        .select()
        .single()

      if (error) {
        logger.error({ error: error.message, email: user.email }, 'Failed to create user')
        throw error
      }

      logger.info({ user_id: data.id, email: user.email }, 'User created')
      
      return {
        id: data.id,
        email: data.email!,
        name: data.name,
        emailVerified: data.email_verified ? new Date(data.email_verified) : null,
        image: data.image,
      }
    },

    async getUser(id) {
      const { data, error } = await db
        .from('users')
        .select('*')
        .eq('id', id)
        .single()

      if (error || !data) return null

      return {
        id: data.id,
        email: data.email!,
        name: data.name,
        emailVerified: data.email_verified ? new Date(data.email_verified) : null,
        image: data.image,
      }
    },

    async getUserByEmail(email) {
      const { data, error } = await db
        .from('users')
        .select('*')
        .eq('email', email.toLowerCase())
        .single()

      if (error || !data) return null

      return {
        id: data.id,
        email: data.email!,
        name: data.name,
        emailVerified: data.email_verified ? new Date(data.email_verified) : null,
        image: data.image,
      }
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const { data: account, error: accountError } = await db
        .from('accounts')
        .select('user_id')
        .eq('provider', provider)
        .eq('provider_account_id', providerAccountId)
        .single()

      if (accountError || !account) return null

      const { data: user, error: userError } = await db
        .from('users')
        .select('*')
        .eq('id', account.user_id)
        .single()

      if (userError || !user) return null

      return {
        id: user.id,
        email: user.email!,
        name: user.name,
        emailVerified: user.email_verified ? new Date(user.email_verified) : null,
        image: user.image,
      }
    },

    async updateUser(user) {
      const updateData: any = {}
      if (user.email !== undefined) updateData.email = user.email
      if (user.name !== undefined) updateData.name = user.name
      if (user.emailVerified !== undefined) updateData.email_verified = user.emailVerified?.toISOString()
      if (user.image !== undefined) updateData.image = user.image
      updateData.updated_at = new Date().toISOString()

      const { data, error } = await db
        .from('users')
        .update(updateData)
        .eq('id', user.id)
        .select()
        .single()

      if (error) {
        logger.error({ error: error.message, user_id: user.id }, 'Failed to update user')
        throw error
      }

      return {
        id: data.id,
        email: data.email!,
        name: data.name,
        emailVerified: data.email_verified ? new Date(data.email_verified) : null,
        image: data.image,
      }
    },

    async deleteUser(id) {
      await db.from('users').delete().eq('id', id)
    },

    async linkAccount(account) {
      logger.debug({ 
        user_id: account.userId, 
        provider: account.provider 
      }, 'Linking account')

      const { error } = await db
        .from('accounts')
        .insert({
          user_id: account.userId,
          type: account.type,
          provider: account.provider,
          provider_account_id: account.providerAccountId,
          refresh_token: account.refresh_token,
          access_token: account.access_token,
          expires_at: account.expires_at,
          token_type: account.token_type,
          scope: account.scope,
          id_token: account.id_token,
          session_state: account.session_state as string | undefined,
        })

      if (error) {
        logger.error({ error: error.message, user_id: account.userId }, 'Failed to link account')
        throw error
      }

      logger.info({ user_id: account.userId, provider: account.provider }, 'Account linked')
    },

    async unlinkAccount({ provider, providerAccountId }) {
      await db
        .from('accounts')
        .delete()
        .eq('provider', provider)
        .eq('provider_account_id', providerAccountId)
    },

    async createSession(session) {
      const { data, error } = await db
        .from('sessions')
        .insert({
          user_id: session.userId,
          session_token: session.sessionToken,
          expires: session.expires.toISOString(),
        })
        .select()
        .single()

      if (error) throw error

      return {
        userId: data.user_id,
        sessionToken: data.session_token,
        expires: new Date(data.expires),
      }
    },

    async getSessionAndUser(sessionToken) {
      const { data: session, error: sessionError } = await db
        .from('sessions')
        .select('*')
        .eq('session_token', sessionToken)
        .single()

      if (sessionError || !session) return null

      const { data: user, error: userError } = await db
        .from('users')
        .select('*')
        .eq('id', session.user_id)
        .single()

      if (userError || !user) return null

      return {
        session: {
          userId: session.user_id,
          sessionToken: session.session_token,
          expires: new Date(session.expires),
        },
        user: {
          id: user.id,
          email: user.email!,
          name: user.name,
          emailVerified: user.email_verified ? new Date(user.email_verified) : null,
          image: user.image,
        },
      }
    },

    async updateSession(session) {
      const { data, error } = await db
        .from('sessions')
        .update({
          expires: session.expires?.toISOString(),
        })
        .eq('session_token', session.sessionToken)
        .select()
        .single()

      if (error || !data) return null

      return {
        userId: data.user_id,
        sessionToken: data.session_token,
        expires: new Date(data.expires),
      }
    },

    async deleteSession(sessionToken) {
      await db.from('sessions').delete().eq('session_token', sessionToken)
    },

    async createVerificationToken(token) {
      const { data, error } = await db
        .from('verification_tokens')
        .insert({
          identifier: token.identifier,
          token: token.token,
          expires: token.expires.toISOString(),
        })
        .select()
        .single()

      if (error) throw error

      return {
        identifier: data.identifier,
        token: data.token,
        expires: new Date(data.expires),
      }
    },

    async useVerificationToken({ identifier, token }) {
      const { data, error } = await db
        .from('verification_tokens')
        .delete()
        .eq('identifier', identifier)
        .eq('token', token)
        .select()
        .single()

      if (error || !data) return null

      return {
        identifier: data.identifier,
        token: data.token,
        expires: new Date(data.expires),
      }
    },
  }
}

