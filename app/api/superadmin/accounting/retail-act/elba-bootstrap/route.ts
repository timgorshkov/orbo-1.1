import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import {
  listOrganizations,
  createContractor,
  ElbaApiError,
} from '@/lib/services/elbaApiClient'

export const dynamic = 'force-dynamic'

/**
 * GET /api/superadmin/accounting/retail-act/elba-bootstrap
 *
 * Диагностика настройки Эльбы: показывает текущие env-переменные и (если
 * ELBA_API_KEY задан) подтягивает список организаций из Эльбы.
 *
 * POST /api/superadmin/accounting/retail-act/elba-bootstrap
 * Body: { organizationId?: string }
 *
 * Создаёт в Эльбе контрагента «Розничные покупатели» и возвращает его id
 * для сохранения в env. Если organizationId не задан в body и не в env —
 * берёт первую организацию из списка.
 */
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, {
    endpoint: '/api/superadmin/accounting/retail-act/elba-bootstrap',
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

    const hasApiKey = !!process.env.ELBA_API_KEY
    const env = {
      ELBA_API_KEY: hasApiKey ? '<set>' : '<missing>',
      ELBA_API_BASE_URL: process.env.ELBA_API_BASE_URL || '<default: https://api-elba.kontur.ru>',
      ELBA_API_VERSION: process.env.ELBA_API_VERSION || '<default: v1>',
      ELBA_ORGANIZATION_ID: process.env.ELBA_ORGANIZATION_ID || '<missing>',
      ELBA_RETAIL_CONTRACTOR_ID: process.env.ELBA_RETAIL_CONTRACTOR_ID || '<missing>',
    }

    if (!hasApiKey) {
      return NextResponse.json({ env, organizations: [], error: 'ELBA_API_KEY is not set' })
    }

    const list = await listOrganizations({ limit: 100 })
    return NextResponse.json({ env, organizations: list.organizations })
  } catch (err: any) {
    logger.error({ error: err.message, stack: err.stack }, 'Error in GET elba-bootstrap')
    if (err instanceof ElbaApiError) {
      return NextResponse.json(
        { error: err.message, statusCode: err.statusCode, elbaBody: err.body },
        { status: 502 }
      )
    }
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, {
    endpoint: '/api/superadmin/accounting/retail-act/elba-bootstrap',
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

    const body = await request.json().catch(() => ({}))
    const bodyOrgId = (body as { organizationId?: string }).organizationId

    let organizationId = bodyOrgId || process.env.ELBA_ORGANIZATION_ID
    if (!organizationId) {
      const list = await listOrganizations({ limit: 1 })
      organizationId = list.organizations?.[0]?.id
      if (!organizationId) {
        return NextResponse.json(
          { error: 'No organizations available in Elba for the configured API key' },
          { status: 400 }
        )
      }
    }

    const created = await createContractor(organizationId, {
      name: 'Розничные покупатели',
    })

    logger.info(
      { organizationId, contractorId: created.id, user_id: user.id },
      'Created retail contractor in Elba'
    )

    return NextResponse.json({
      organizationId,
      retailContractorId: created.id,
      hint:
        'Сохраните ELBA_ORGANIZATION_ID и ELBA_RETAIL_CONTRACTOR_ID в .env на сервере и перезапустите контейнер, чтобы не создавать контрагента повторно.',
    })
  } catch (err: any) {
    logger.error({ error: err.message, stack: err.stack }, 'Error in POST elba-bootstrap')
    if (err instanceof ElbaApiError) {
      return NextResponse.json(
        { error: err.message, statusCode: err.statusCode, elbaBody: err.body },
        { status: 502 }
      )
    }
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
