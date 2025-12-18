import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'

export const dynamic = 'force-dynamic';

/**
 * GET /api/whatsapp/imports?orgId=xxx
 * Get list of WhatsApp imports for an organization
 */
export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/whatsapp/imports' });
  let orgId: string | null = null;
  try {
    orgId = request.nextUrl.searchParams.get('orgId')
    if (!orgId) {
      return NextResponse.json({ error: 'orgId is required' }, { status: 400 })
    }
    
    const supabase = await createClientServer()
    
    // Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Check org membership
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .single()
    
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Only admins can view imports' }, { status: 403 })
    }
    
    // Get imports
    const { data: imports, error } = await supabase
      .from('whatsapp_imports')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50)
    
    if (error) {
      logger.error({ 
        error: error.message,
        org_id: orgId
      }, 'Error fetching imports');
      return NextResponse.json({ error: 'Failed to fetch imports' }, { status: 500 })
    }
    
    logger.info({ 
      import_count: imports?.length || 0,
      org_id: orgId
    }, 'Fetched WhatsApp imports');
    return NextResponse.json({ imports: imports || [] })
    
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      org_id: orgId || 'unknown'
    }, 'Unexpected error');
    return NextResponse.json({ 
      error: 'Failed to fetch imports' 
    }, { status: 500 })
  }
}

