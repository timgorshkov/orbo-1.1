import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'

export const dynamic = 'force-dynamic'

/** POST /api/telegram/groups/forum-flag — toggle is_forum on a telegram_groups row */
export async function POST(request: NextRequest) {
  const user = await getUnifiedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { orgId, tgChatId, isForum } = body

  if (!orgId || tgChatId == null) {
    return NextResponse.json({ error: 'orgId and tgChatId required' }, { status: 400 })
  }

  const access = await getEffectiveOrgRole(user.id, orgId)
  if (!access || !['owner', 'admin'].includes(access.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db = createAdminServer()
  await db
    .from('telegram_groups')
    .update({ is_forum: !!isForum })
    .filter('tg_chat_id::text', 'eq', String(tgChatId))

  return NextResponse.json({ ok: true })
}
