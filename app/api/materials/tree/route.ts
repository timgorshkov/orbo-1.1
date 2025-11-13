import { NextRequest, NextResponse } from 'next/server';
import { requireOrgAccess } from '@/lib/orgGuard';
import { MaterialService } from '@/lib/server/materials/service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { org: string } }) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get('orgId') ?? params.org;

  if (!orgId) {
    return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
  }

  try {
    // ✅ Разрешаем просмотр дерева материалов для members
    await requireOrgAccess(orgId, undefined, ['owner', 'admin', 'member']);
    const tree = await MaterialService.getTree(orgId);
    return NextResponse.json({ tree });
  } catch (error: any) {
    console.error('Materials tree error', error);
    return NextResponse.json({ error: error.message ?? 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { org: string } }) {
  const body = await request.json();
  const orgId = body.orgId ?? params.org;
  if (!orgId) {
    return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
  }

  try {
    const { user } = await requireOrgAccess(orgId, undefined, ['owner', 'admin']);
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
    console.error('Materials create error', error);
    return NextResponse.json({ error: error.message ?? 'Internal server error' }, { status: 500 });
  }
}

