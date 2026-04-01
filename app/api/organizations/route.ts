import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedSession } from '@/lib/auth/unified-auth'
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/logAdminAction'

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: '/api/organizations' });
  try {
    const { name } = await req.json()
    
    // Используем сервисную роль для обхода RLS
    const supabase = createAdminServer()

    // Используем unified auth для поддержки Supabase и NextAuth пользователей
    const session = await getUnifiedSession();
    
    logger.debug({ 
      user_id: session?.user?.id,
      provider: session?.provider,
      has_session: !!session
    }, 'User data from unified auth');
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' }, 
        { status: 401 }
      )
    }
    
    const user = { id: session.user.id, email: session.user.email };

    // Idempotency: if this is the auto-created "Моё сообщество" org and the user
    // already owns one created in the last 10 minutes, return it instead of creating a duplicate.
    // This prevents duplicate orgs when two browser sessions hit /welcome simultaneously.
    if (name.trim() === 'Моё сообщество') {
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
      const { data: recentMemberships } = await supabase
        .from('memberships')
        .select('org_id, created_at')
        .eq('user_id', user.id)
        .eq('role', 'owner')
        .gte('created_at', tenMinAgo)
        .limit(5)

      if (recentMemberships && recentMemberships.length > 0) {
        const recentOrgIds = recentMemberships.map((m: any) => m.org_id)
        const { data: existingOrgs } = await supabase
          .from('organizations')
          .select('id, name')
          .in('id', recentOrgIds)
          .eq('name', 'Моё сообщество')
          .limit(1)

        if (existingOrgs && existingOrgs.length > 0) {
          logger.info({ user_id: user.id, org_id: existingOrgs[0].id }, 'Auto-create idempotency: returning existing org')
          return NextResponse.json({ org_id: existingOrgs[0].id, existed: true })
        }
      }
    }

    // Создаем новую организацию (с серверной стороны обходит RLS)
    const insertData = {
      name: name.trim(),
      plan: 'free' // Базовый план по умолчанию
    };
    
    logger.info({ 
      insert_data: insertData,
      user_id: user.id
    }, 'Attempting to insert organization');
    
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert(insertData)
      .select('id, name, created_at')
      .single()
    
    logger.info({ 
      org_data: org,
      org_error: orgError?.message,
      org_id: org?.id,
      org_name: org?.name,
      org_created_at: org?.created_at
    }, 'Organization insert result');
    
    if (orgError) {
      logger.error({ 
        error: orgError.message,
        code: orgError.code,
        details: orgError.details,
        user_id: user.id,
        org_name: name
      }, 'Error creating organization');
      return NextResponse.json(
        { error: orgError.message }, 
        { status: 400 }
      )
    }
    
    // Проверяем что ID новый (а не существующий)
    if (org.name !== insertData.name) {
      logger.error({ 
        expected_name: insertData.name,
        actual_name: org.name,
        org_id: org.id,
        created_at: org.created_at
      }, 'CRITICAL: Organization name mismatch! Insert returned wrong organization');
    }
    
    // Создаем членство для текущего пользователя как владельца
    const { error: memberError } = await supabase
      .from('memberships')
      .insert({
        org_id: org.id,
        user_id: user.id,
        role: 'owner' // Роль владельца
      })

    logger.debug({ 
      user_id: user.id,
      org_id: org.id
    }, 'Membership insertion attempt');

    if (memberError) {
      logger.error({ 
        error: memberError.message,
        user_id: user.id,
        org_id: org.id
      }, 'Error creating membership');
      return NextResponse.json(
        { error: memberError.message }, 
        { status: 400 }
      )
    }
    
    logger.info({ 
      org_id: org.id,
      user_id: user.id,
      org_name: name
    }, 'Organization created successfully');

    // Auto-link Telegram account when org is created.
    // Covers two cases:
    //   1. User registered via Telegram OAuth (accounts.provider = 'telegram')
    //   2. User linked TG on the welcome screen (users.tg_user_id set, no OAuth record)
    try {
      // Case 1: OAuth registration
      const { data: tgAccount } = await supabase
        .from('accounts')
        .select('provider_account_id')
        .eq('user_id', user.id)
        .eq('provider', 'telegram')
        .maybeSingle()

      // Case 2: welcome-screen linking — read tg_user_id directly from users table
      let tgUserIdFromUser: number | null = null
      if (!tgAccount?.provider_account_id) {
        const { data: userData } = await supabase
          .from('users')
          .select('tg_user_id')
          .eq('id', user.id)
          .maybeSingle()
        tgUserIdFromUser = userData?.tg_user_id ? Number(userData.tg_user_id) : null
      }

      const rawTgId = tgAccount?.provider_account_id || (tgUserIdFromUser ? String(tgUserIdFromUser) : null)

      if (rawTgId) {
        const tgUserId = Number(rawTgId)

        // Check if this org already has a link for this user (shouldn't, but be safe)
        const { data: existing } = await supabase
          .from('user_telegram_accounts')
          .select('id')
          .eq('user_id', user.id)
          .eq('org_id', org.id)
          .maybeSingle()

        if (!existing) {
          // Fetch Telegram profile info via Bot API (try multiple bots)
          let tgUsername = ''
          let tgFirstName = ''
          let tgLastName = ''
          const botTokens = [
            process.env.TELEGRAM_BOT_TOKEN,
            process.env.TELEGRAM_REGISTRATION_BOT_TOKEN,
            process.env.TELEGRAM_NOTIFICATIONS_BOT_TOKEN,
          ].filter(Boolean) as string[]

          for (const token of botTokens) {
            try {
              const chatRes = await fetch(`https://api.telegram.org/bot${token}/getChat?chat_id=${tgUserId}`, {
                signal: AbortSignal.timeout(3000),
              })
              const chatData = await chatRes.json()
              if (chatData.ok) {
                tgUsername = chatData.result.username || ''
                tgFirstName = chatData.result.first_name || ''
                tgLastName = chatData.result.last_name || ''
                break
              }
            } catch { /* try next bot */ }
          }

          // Fallback: get username from telegram_auth_codes (always captured by bot)
          if (!tgUsername) {
            const { data: authCode } = await supabase
              .from('telegram_auth_codes')
              .select('telegram_username, telegram_user_id')
              .eq('telegram_user_id', tgUserId)
              .not('telegram_username', 'is', null)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
            if (authCode?.telegram_username) {
              tgUsername = authCode.telegram_username
            }
          }

          await supabase
            .from('user_telegram_accounts')
            .insert({
              user_id: user.id,
              org_id: org.id,
              telegram_user_id: tgUserId,
              telegram_username: tgUsername,
              telegram_first_name: tgFirstName,
              telegram_last_name: tgLastName,
              is_verified: true,
              verified_at: new Date().toISOString(),
            })

          logger.info({
            user_id: user.id,
            org_id: org.id,
            tg_user_id: tgUserId,
          }, 'Auto-linked Telegram account to new organization')
        }
      }
    } catch (tgError: any) {
      logger.warn({ error: tgError.message }, 'Failed to auto-link Telegram (non-critical)')
    }
    
    logAdminAction({
      orgId: org.id,
      userId: user.id,
      action: AdminActions.CREATE_ORGANIZATION,
      resourceType: ResourceTypes.ORGANIZATION,
      resourceId: org.id,
      metadata: { org_name: name.trim() },
    }).catch(() => {});
    
    // Sync to CRM (non-blocking)
    import('@/lib/services/weeekService').then(({ onOrganizationCreated }) => {
      onOrganizationCreated(user.id, org.id, name.trim()).catch(() => {});
    }).catch(() => {});

    // Re-schedule onboarding chain for this organization (non-blocking)
    ;(async () => {
      try {
        const { scheduleOnboardingChain } = await import('@/lib/services/onboardingChainService')
        const tgRes = await supabase
          .from('accounts')
          .select('provider_account_id')
          .eq('user_id', user.id)
          .eq('provider', 'telegram')
          .maybeSingle()
        const channel = tgRes.data?.provider_account_id ? 'telegram' as const : 'email' as const
        await scheduleOnboardingChain(user.id, channel, { restart: true })
      } catch { /* non-critical */ }
    })()
    
    return NextResponse.json({ success: true, org_id: org.id })
    
  } catch (err: any) {
    logger.error({ 
      error: err.message || String(err),
      stack: err.stack
    }, 'Unexpected error in POST /api/organizations');
    return NextResponse.json(
      { error: err.message || 'Произошла неизвестная ошибка' }, 
      { status: 500 }
    )
  }
}