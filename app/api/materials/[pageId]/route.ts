import { NextRequest, NextResponse } from 'next/server';
import { MaterialService } from '@/lib/server/materials/service';
import { requireOrgAccess } from '@/lib/orgGuard';
import { createAPILogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const logger = createAPILogger(request, { endpoint: '/api/materials/[pageId]' });
  const orgId = request.nextUrl.searchParams.get('orgId');
  if (!orgId) {
    return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
  }

  // ✅ Разрешаем просмотр материалов для members
  const { role } = await requireOrgAccess(orgId, ['owner', 'admin', 'member']);
  if (!['owner', 'admin', 'member'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const page = await MaterialService.getPage(orgId, pageId);
    if (!page) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ page });
  } catch (error: any) {
    logger.error({
      error: error.message || String(error),
      stack: error.stack,
      page_id: pageId,
      org_id: orgId
    }, 'Materials get error');
    return NextResponse.json({ error: error.message ?? 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const logger = createAPILogger(request, { endpoint: '/api/materials/[pageId]' });
  const body = await request.json();
  const orgId = body.orgId ?? request.nextUrl.searchParams.get('orgId');
  if (!orgId) {
    return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
  }

  try {
    const { user, role } = await requireOrgAccess(orgId, ['owner', 'admin']);
    const patch: Parameters<typeof MaterialService.updatePage>[1] = {
      updated_by: user.id ?? null,
    };
    if (body.title !== undefined) patch.title = body.title;
    if (body.slug !== undefined) patch.slug = body.slug;
    if (body.contentMd !== undefined) patch.content_md = body.contentMd;
    if (body.visibility !== undefined) patch.visibility = body.visibility;
    const page = await MaterialService.updatePage(pageId, patch);
    return NextResponse.json({ page });
  } catch (error: any) {
    logger.error({
      error: error.message || String(error),
      stack: error.stack,
      page_id: pageId,
      org_id: orgId
    }, 'Materials update error');
    return NextResponse.json({ error: error.message ?? 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const logger = createAPILogger(request, { endpoint: '/api/materials/[pageId]' });
  const orgId = request.nextUrl.searchParams.get('orgId');
  if (!orgId) {
    return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
  }

  try {
    await requireOrgAccess(orgId, ['owner', 'admin']);
    await MaterialService.deletePage(pageId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    logger.error({
      error: error.message || String(error),
      stack: error.stack,
      page_id: pageId,
      org_id: orgId
    }, 'Materials delete error');
    return NextResponse.json({ error: error.message ?? 'Internal server error' }, { status: 500 });
  }
}

