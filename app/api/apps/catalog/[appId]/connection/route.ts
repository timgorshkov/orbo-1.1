import { createAdminServer } from '@/lib/server/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/apps/catalog/[appId]/connection?orgId=...
 * 
 * Returns the connection details including connected_groups for a catalog app.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  const { appId } = await params;
  const orgId = request.nextUrl.searchParams.get('orgId');
  
  if (!orgId) {
    return NextResponse.json({ error: 'orgId is required' }, { status: 400 });
  }
  
  try {
    const adminSupabase = createAdminServer();
    
    const { data: connection, error } = await adminSupabase
      .from('public_app_connections')
      .select('id, connected_groups, status')
      .eq('public_app_id', appId)
      .eq('org_id', orgId)
      .eq('status', 'active')
      .single();
    
    if (error || !connection) {
      return NextResponse.json({ connected_groups: [] });
    }
    
    return NextResponse.json({ 
      connected_groups: connection.connected_groups || [] 
    });
  } catch (error) {
    return NextResponse.json({ connected_groups: [] });
  }
}
