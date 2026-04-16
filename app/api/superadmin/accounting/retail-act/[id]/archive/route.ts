import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { buildActArchive } from '@/lib/services/retailActService'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/superadmin/accounting/retail-act/[id]/archive
 *
 * Возвращает ZIP-архив с актом и реестром-расшифровкой по id документа.
 * Реестр формируется на лету из metadata.payments.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const logger = createAPILogger(request, {
    endpoint: '/api/superadmin/accounting/retail-act/[id]/archive',
  })

  try {
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const db = createAdminServer()
    const { data: superadminRow } = await db
      .from('superadmins')
      .select('user_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()
    if (!superadminRow) {
      return NextResponse.json({ error: 'Superadmin access required' }, { status: 403 })
    }

    const archive = await buildActArchive(params.id)
    if (!archive) {
      return NextResponse.json({ error: 'Retail act not found' }, { status: 404 })
    }

    const body = new Uint8Array(archive.buffer)
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${archive.filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err: any) {
    logger.error(
      { error: err.message, stack: err.stack, docId: params.id },
      'Error in GET retail-act/[id]/archive'
    )
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
