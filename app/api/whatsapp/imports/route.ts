import { NextRequest, NextResponse } from 'next/server'
import { createClientServer } from '@/lib/server/supabaseServer'

export const dynamic = 'force-dynamic';

/**
 * GET /api/whatsapp/imports?orgId=xxx
 * Get list of WhatsApp imports for an organization
 */
export async function GET(request: NextRequest) {
  try {
    const orgId = request.nextUrl.searchParams.get('orgId')
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
      console.error('[WhatsApp Imports] Error fetching imports:', error)
      return NextResponse.json({ error: 'Failed to fetch imports' }, { status: 500 })
    }
    
    return NextResponse.json({ imports: imports || [] })
    
  } catch (error) {
    console.error('[WhatsApp Imports] Unexpected error:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch imports' 
    }, { status: 500 })
  }
}

