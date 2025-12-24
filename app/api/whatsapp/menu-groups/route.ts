import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/whatsapp/menu-groups?orgId=xxx
 * 
 * Get WhatsApp imports that should show in menu
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const orgId = url.searchParams.get('orgId');
    
    if (!orgId) {
      return NextResponse.json({ error: 'orgId required' }, { status: 400 });
    }
    
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ groups: [] });
    }
    
    const adminSupabase = createAdminServer();
    
    // Check membership
    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();
    
    if (!membership) {
      return NextResponse.json({ groups: [] });
    }
    
    // Get WhatsApp imports with show_in_menu = true
    const { data: imports } = await adminSupabase
      .from('whatsapp_imports')
      .select('id, group_name, messages_imported')
      .eq('org_id', orgId)
      .eq('show_in_menu', true)
      .eq('import_status', 'completed')
      .order('group_name');
    
    return NextResponse.json({ groups: imports || [] });
  } catch (error) {
    return NextResponse.json({ groups: [] });
  }
}

