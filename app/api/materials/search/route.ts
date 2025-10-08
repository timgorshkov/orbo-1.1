import { NextRequest, NextResponse } from 'next/server';
import { requireOrgAccess } from '@/lib/orgGuard';
import { MaterialService } from '@/lib/server/materials/service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get('orgId');
  const query = request.nextUrl.searchParams.get('q') ?? '';

  if (!orgId) {
    return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
  }

  try {
    await requireOrgAccess(orgId, undefined, ['owner', 'admin']);
    if (!query.trim()) {
      return NextResponse.json({ results: [] });
    }

    const results = await MaterialService.search(orgId, query.trim());
    return NextResponse.json({ results });
  } catch (error: any) {
    console.error('Materials search error', error);
    return NextResponse.json({ error: error.message ?? 'Internal server error' }, { status: 500 });
  }
}
