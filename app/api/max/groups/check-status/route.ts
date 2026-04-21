import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'
import { createMaxService } from '@/lib/services/maxService'

export const dynamic = 'force-dynamic'

/**
 * POST /api/max/groups/check-status
 *
 * On-demand проверка статуса бота и admin-прав в MAX-группе.
 * Вызывается при открытии страницы MAX-групп и при нажатии «Проверить».
 *
 * Body: { org_id, max_chat_id }
 *
 * Возвращает:
 *   - bot_in_group: boolean — бот в группе
 *   - bot_is_admin: boolean — бот админ
 *   - bot_can_send: boolean — бот может отправлять сообщения
 *   - group_title: string
 *   - member_count: number
 *   - admins: { user_id, name, is_owner }[]
 *
 * Побочный эффект: обновляет max_groups.bot_status и member_count.
 */
export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/max/groups/check-status' })

  try {
    const user = await getUnifiedUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const { org_id, max_chat_id } = body
    if (!org_id || !max_chat_id) {
      return NextResponse.json({ error: 'org_id and max_chat_id required' }, { status: 400 })
    }

    const role = await getEffectiveOrgRole(user.id, org_id)
    if (!role || !['owner', 'admin'].includes(role.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const db = createAdminServer()
    let maxService: ReturnType<typeof createMaxService>
    try {
      maxService = createMaxService('main')
    } catch {
      return NextResponse.json({
        error: 'MAX_MAIN_BOT_TOKEN не настроен',
        bot_in_group: false,
        bot_is_admin: false,
        bot_can_send: false,
      })
    }

    // 1. Получить info о боте
    let botUserId: number | null = null
    try {
      const meRes = await maxService.getMe()
      botUserId = meRes.ok ? (meRes.data?.user_id ?? null) : null
    } catch {
      // Не критично — просто не сможем проверить bot membership
    }

    // 2. Получить info о чате
    const chatId = Number(max_chat_id)
    let botInGroup = false
    let botIsAdmin = false
    let botCanSend = false
    let groupTitle = ''
    let memberCount = 0

    try {
      const chatRes = await maxService.getChat(chatId)
      if (chatRes.ok && chatRes.data) {
        groupTitle = chatRes.data.title || ''
        memberCount = chatRes.data.participants_count || 0
        // Если getChat успешен — бот в группе (иначе 403)
        botInGroup = true
      }
    } catch {
      // Бота нет в группе или группа не существует
      await db.from('max_groups').update({ bot_status: 'inactive' }).eq('max_chat_id', String(chatId))
      return NextResponse.json({
        bot_in_group: false,
        bot_is_admin: false,
        bot_can_send: false,
        group_title: groupTitle,
        member_count: 0,
        admins: [],
        warning: 'Бот не найден в группе. Возможно, он был удалён.',
      })
    }

    // 3. Проверить — бот админ?
    const admins: { user_id: number; name: string; is_owner: boolean }[] = []
    try {
      const adminsRes = await maxService.getChatAdmins(chatId)
      if (adminsRes.ok && Array.isArray(adminsRes.data?.members)) {
        for (const m of adminsRes.data.members) {
          admins.push({
            user_id: m.user_id,
            name: m.name || m.username || `User ${m.user_id}`,
            is_owner: m.is_owner === true,
          })
          if (botUserId && m.user_id === botUserId) {
            botIsAdmin = true
          }
        }
      }
    } catch {
      // Не удалось получить список админов — возможно бот не админ
    }

    // Если бот в группе — допускаем что может отправлять (MAX не гранулирует permissions как TG)
    botCanSend = botInGroup

    // 4. Обновить max_groups в БД
    const newBotStatus = botInGroup ? 'connected' : 'inactive'
    await db.from('max_groups').update({
      bot_status: newBotStatus,
      title: groupTitle || undefined,
      member_count: memberCount || undefined,
      last_sync_at: new Date().toISOString(),
    }).eq('max_chat_id', String(chatId))

    logger.info({
      org_id,
      max_chat_id: chatId,
      bot_in_group: botInGroup,
      bot_is_admin: botIsAdmin,
      member_count: memberCount,
      admins_count: admins.length,
    }, 'MAX group status checked')

    return NextResponse.json({
      bot_in_group: botInGroup,
      bot_is_admin: botIsAdmin,
      bot_can_send: botCanSend,
      group_title: groupTitle,
      member_count: memberCount,
      admins,
      bot_status: newBotStatus,
      checked_at: new Date().toISOString(),
    })
  } catch (err: any) {
    logger.error({ error: err.message }, 'Error checking MAX group status')
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
