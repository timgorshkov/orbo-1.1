import { NextRequest, NextResponse } from 'next/server';
import { requireOrgAccess } from '@/lib/orgGuard';
import { MaterialService } from '@/lib/server/materials/service';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const orgId = body.orgId;

  if (!orgId) {
    return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
  }

  try {
    await requireOrgAccess(orgId, undefined, ['owner', 'admin']);
    const page = await MaterialService.movePage({
      pageId: body.pageId,
      newParentId: body.parentId ?? null,
      newPosition: body.position ?? 0
    });
    return NextResponse.json({ page });
  } catch (error: any) {
    console.error('Materials move error', error);
    return NextResponse.json({ error: error.message ?? 'Internal server error' }, { status: 500 });
  }
}

