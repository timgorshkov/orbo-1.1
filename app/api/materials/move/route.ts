import { NextRequest, NextResponse } from 'next/server';
import { requireOrgAccess } from '@/lib/orgGuard';
import { MaterialService } from '@/lib/server/materials/service';
import { createAPILogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/materials/move' });
  let orgId: string | undefined;
  let pageId: string | undefined;
  try {
    const body = await request.json();
    orgId = body.orgId;
    pageId = body.pageId;

    if (!orgId) {
      return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
    }
    await requireOrgAccess(orgId, ['owner', 'admin']);
    const page = await MaterialService.movePage({
      pageId: pageId!,
      newParentId: body.parentId ?? null,
      newPosition: body.position ?? 0
    });
    return NextResponse.json({ page });
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      org_id: orgId || 'unknown',
      page_id: pageId || 'unknown'
    }, 'Materials move error');
    return NextResponse.json({ error: error.message ?? 'Internal server error' }, { status: 500 });
  }
}

