import { NextRequest, NextResponse } from 'next/server';
import { requireOrgAccess } from '@/lib/orgGuard';
import { MaterialService } from '@/lib/server/materials/service';
import { createAPILogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { org: string } }) {
  const logger = createAPILogger(request, { endpoint: '/api/materials/tree' });
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get('orgId') ?? params.org;

  if (!orgId) {
    return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
  }

  try {
    // ✅ Разрешаем просмотр дерева материалов для members
    await requireOrgAccess(orgId, ['owner', 'admin', 'member']);
    const tree = await MaterialService.getTree(orgId);
    return NextResponse.json({ tree });
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      org_id: orgId
    }, 'Materials tree error');
    return NextResponse.json({ error: error.message ?? 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { org: string } }) {
  const logger = createAPILogger(request, { endpoint: '/api/materials/tree' });
  const body = await request.json();
  const orgId = body.orgId ?? params.org;
  if (!orgId) {
    return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
  }

  try {
    const { user } = await requireOrgAccess(orgId, ['owner', 'admin']);
    const page = await MaterialService.createPage({
      orgId,
      parentId: body.parentId ?? null,
      title: body.title ?? 'Новая страница',
      slug: body.slug ?? null,
      contentMd: body.contentMd ?? '',
      visibility: body.visibility ?? 'org_members',
      createdBy: user.id
    });
    return NextResponse.json({ page });
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      org_id: orgId
    }, 'Materials create error');
    return NextResponse.json({ error: error.message ?? 'Internal server error' }, { status: 500 });
  }
}

