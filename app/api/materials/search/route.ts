import { NextRequest, NextResponse } from 'next/server';
import { requireOrgAccess } from '@/lib/orgGuard';
import { MaterialService } from '@/lib/server/materials/service';
import { createAPILogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/materials/search' });
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
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      org_id: orgId,
      query
    }, 'Materials search error');
    return NextResponse.json({ error: error.message ?? 'Internal server error' }, { status: 500 });
  }
}
