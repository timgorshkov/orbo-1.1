import { NextRequest, NextResponse } from 'next/server';
import { MaterialService } from '@/lib/server/materials/service';
import { requireOrgAccess } from '@/lib/orgGuard';
import { createAPILogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { pageId: string } }) {
  const logger = createAPILogger(request, { endpoint: '/api/materials/[pageId]' });
  const orgId = request.nextUrl.searchParams.get('orgId');
  if (!orgId) {
    return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
  }

  // ✅ Разрешаем просмотр материалов для members
  const { role } = await requireOrgAccess(orgId, undefined, ['owner', 'admin', 'member']);
  if (!['owner', 'admin', 'member'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const page = await MaterialService.getPage(orgId, params.pageId);
    if (!page) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ page });
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      page_id: params.pageId,
      org_id: orgId
    }, 'Materials get error');
    return NextResponse.json({ error: error.message ?? 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { pageId: string } }) {
  const body = await request.json();
  const orgId = body.orgId ?? request.nextUrl.searchParams.get('orgId');
  if (!orgId) {
    return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
  }

  try {
    const { user, role } = await requireOrgAccess(orgId, undefined, ['owner', 'admin']);
    const page = await MaterialService.updatePage(params.pageId, {
      title: body.title,
      slug: body.slug,
      content_md: body.contentMd,
      visibility: body.visibility,
      updated_by: user.id ?? null
    });
    return NextResponse.json({ page });
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      page_id: params.pageId,
      org_id: orgId
    }, 'Materials update error');
    return NextResponse.json({ error: error.message ?? 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { pageId: string } }) {
  const orgId = request.nextUrl.searchParams.get('orgId');
  if (!orgId) {
    return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
  }

  try {
    await requireOrgAccess(orgId, undefined, ['owner', 'admin']);
    await MaterialService.deletePage(params.pageId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      page_id: params.pageId,
      org_id: orgId
    }, 'Materials delete error');
    return NextResponse.json({ error: error.message ?? 'Internal server error' }, { status: 500 });
  }
}

