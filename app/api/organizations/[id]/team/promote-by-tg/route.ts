import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/logAdminAction'

export const dynamic = 'force-dynamic'

/**
 * POST /api/organizations/[id]/team/promote-by-tg
 *
 * Назначает teneвого telegram-админа (админа связанной Telegram-группы, который
 * ещё не является admin'ом в Orbo) на роль администратора организации —
 * если этот Telegram-аккаунт уже верифицирован какой-либо учёткой Orbo.
 *
 * Body:
 *   { tg_user_id: number }          — обязательно
 *   { candidate_user_id?: string }  — опциональная подсказка из GET /team
 *
 * Логика:
 *   1. Проверить, что вызвавший — owner этой org (только он может менять админов).
 *   2. Убедиться что у этого tg_user_id есть верифицированная связка в
 *      user_telegram_accounts (is_verified=true).
 *   3. Выбрать «лучшего» user (тот же порядок, что в GET /team) и создать
 *      или повысить membership до admin (role_source='telegram_admin').
 *   4. Синхронизировать profile.email_verified_at (если есть) — чтобы view
 *      organization_admins сразу увидел его как verified.
 *   5. Отправить уведомление на email.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, {
    endpoint: 'organizations/[id]/team/promote-by-tg',
  })
  const { id: orgId } = await params

  try {
    const currentUser = await getUnifiedUser()
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const role = await getEffectiveOrgRole(currentUser.id, orgId)
    if (!role || role.role !== 'owner') {
      return NextResponse.json(
        { error: 'Назначать администраторов может только владелец организации' },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const rawTgUserId = body?.tg_user_id
    const tgUserId =
      typeof rawTgUserId === 'number'
        ? rawTgUserId
        : typeof rawTgUserId === 'string'
          ? parseInt(rawTgUserId, 10)
          : NaN
    if (!tgUserId || isNaN(tgUserId)) {
      return NextResponse.json(
        { error: 'tg_user_id обязателен' },
        { status: 400 }
      )
    }

    const db = createAdminServer()

    // 1. Находим «лучшего» user для этого tg_user_id
    const { data: cand, error: candErr } = await db.raw(
      `SELECT u.id AS user_id,
              u.email,
              (u.email_verified IS NOT NULL) AS email_verified
         FROM user_telegram_accounts uta
         JOIN users u ON u.id = uta.user_id
        WHERE uta.telegram_user_id = $1
          AND uta.is_verified = true
          AND u.email IS NOT NULL
        ORDER BY
          (u.email_verified IS NOT NULL) DESC,
          (u.email NOT ILIKE 'test%@orbo.ru' AND u.email NOT ILIKE '%@orbo.ru') DESC,
          u.created_at ASC
        LIMIT 1`,
      [tgUserId]
    )
    if (candErr) {
      logger.error({ error: candErr.message, tg_user_id: tgUserId }, 'Lookup failed')
      return NextResponse.json({ error: 'Ошибка поиска пользователя' }, { status: 500 })
    }

    const candidate = cand?.[0] as
      | { user_id: string; email: string; email_verified: boolean }
      | undefined
    if (!candidate) {
      return NextResponse.json(
        {
          error:
            'Этот Telegram-пользователь ещё не верифицирован в Orbo. Попросите его написать боту @orbo_assistant_bot для привязки аккаунта.',
        },
        { status: 404 }
      )
    }

    // Если body.candidate_user_id задан — сверяемся, что он соответствует найденному
    // (защита от гонки между GET/POST, когда кандидат мог поменяться).
    if (
      typeof body?.candidate_user_id === 'string' &&
      body.candidate_user_id !== candidate.user_id
    ) {
      logger.warn(
        {
          org_id: orgId,
          tg_user_id: tgUserId,
          ui_candidate: body.candidate_user_id,
          db_candidate: candidate.user_id,
        },
        'Candidate user mismatch — using DB pick'
      )
    }

    // 2. Проверяем, не является ли этот user уже членом org
    const { data: existing } = await db
      .from('memberships')
      .select('id, role, role_source')
      .eq('org_id', orgId)
      .eq('user_id', candidate.user_id)
      .maybeSingle()

    if (existing) {
      if (existing.role === 'admin' || existing.role === 'owner') {
        return NextResponse.json(
          {
            success: true,
            already: true,
            message: 'Пользователь уже является администратором',
            user_id: candidate.user_id,
          }
        )
      }
      // Повышаем до admin
      await db
        .from('memberships')
        .update({
          role: 'admin',
          role_source: 'telegram_admin',
          metadata: {
            promoted_at: new Date().toISOString(),
            promoted_by: currentUser.id,
            promoted_by_method: 'tg_promote',
            tg_user_id: tgUserId,
          },
        })
        .eq('id', existing.id)
    } else {
      // Создаём membership
      const { error: insertErr } = await db.from('memberships').insert({
        org_id: orgId,
        user_id: candidate.user_id,
        role: 'admin',
        role_source: 'telegram_admin',
        metadata: {
          added_at: new Date().toISOString(),
          added_by: currentUser.id,
          added_by_method: 'tg_promote',
          tg_user_id: tgUserId,
        },
      })
      if (insertErr) {
        logger.error(
          { error: insertErr.message, org_id: orgId, user_id: candidate.user_id },
          'Failed to insert membership'
        )
        return NextResponse.json(
          { error: 'Ошибка добавления в команду' },
          { status: 500 }
        )
      }
    }

    // 3. Синхронизируем profile (email + email_verified_at) — чтобы view
    //    organization_admins сразу увидел его как verified-админа.
    if (candidate.email_verified) {
      await db.raw(
        `INSERT INTO profiles (id, email, email_verified_at, created_at, updated_at)
         VALUES ($1, $2, NOW(), NOW(), NOW())
         ON CONFLICT (id) DO UPDATE
           SET email = EXCLUDED.email,
               email_verified_at = COALESCE(profiles.email_verified_at, EXCLUDED.email_verified_at),
               updated_at = NOW()`,
        [candidate.user_id, candidate.email]
      )
    } else {
      // Хотя бы email в profile заполним, чтобы в UI отображалось
      await db.raw(
        `INSERT INTO profiles (id, email, created_at, updated_at)
         VALUES ($1, $2, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE
           SET email = COALESCE(profiles.email, EXCLUDED.email),
               updated_at = NOW()`,
        [candidate.user_id, candidate.email]
      )
    }

    // 4. Закрываем «висящие» invitations на этот email
    await db.raw(
      `UPDATE invitations
          SET status = 'accepted',
              accepted_at = NOW()
        WHERE org_id = $1
          AND LOWER(email) = LOWER($2)
          AND status = 'pending'`,
      [orgId, candidate.email]
    )

    // 5. Отправляем уведомление
    const { data: org } = await db
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .single()
    const orgName = org?.name || 'организации'
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru'
    const signInUrl = `${appUrl}/signin?email=${encodeURIComponent(candidate.email)}`

    try {
      const { sendEmail } = await import('@/lib/services/email')
      await sendEmail({
        to: candidate.email,
        subject: `Вы назначены администратором в команде ${orgName}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 24px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;">Orbo</h1>
            </div>
            <div style="background: #ffffff; padding: 32px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
              <h2 style="color: #1f2937; margin-top: 0;">Вы назначены администратором</h2>
              <p style="font-size: 16px;">
                Владелец организации <strong>${orgName}</strong> назначил вас администратором на основании ваших прав администратора в связанных Telegram-группах.
              </p>
              <p style="font-size: 15px; background: #f3f4f6; border-radius: 8px; padding: 12px 16px; margin: 20px 0;">
                <strong>Ваш Telegram уже верифицирован в Orbo</strong>, поэтому дополнительных действий не требуется.
                Войдите в Orbo по этому email — и сразу увидите организацию в списке.
              </p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${signInUrl}" style="display: inline-block; background: #667eea; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600;">Войти в Orbo</a>
              </div>
            </div>
          </div>
        `,
      })
    } catch (emailError) {
      logger.warn(
        {
          error: emailError instanceof Error ? emailError.message : String(emailError),
          user_id: candidate.user_id,
        },
        'Failed to send promote notification (non-blocking)'
      )
    }

    logAdminAction({
      orgId,
      userId: currentUser.id,
      action: AdminActions.ADD_TEAM_MEMBER,
      resourceType: ResourceTypes.TEAM_MEMBER,
      resourceId: candidate.user_id,
      metadata: { tg_user_id: tgUserId, method: 'tg_promote', email: candidate.email },
    }).catch(() => {})

    logger.info(
      {
        org_id: orgId,
        user_id: candidate.user_id,
        tg_user_id: tgUserId,
        email: candidate.email,
        promoted_by: currentUser.id,
      },
      'Shadow admin promoted via Telegram'
    )

    return NextResponse.json({
      success: true,
      user_id: candidate.user_id,
      email: candidate.email,
      message: `Пользователь ${candidate.email} назначен администратором`,
    })
  } catch (error: any) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), org_id: orgId },
      'Error promoting TG admin'
    )
    return NextResponse.json(
      { error: 'Внутренняя ошибка сервера' },
      { status: 500 }
    )
  }
}
