import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/whatsapp/[importId]
 * 
 * Get WhatsApp import details
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ importId: string }> }
) {
  const logger = createAPILogger(req, { endpoint: '/api/whatsapp/[importId]' });
  
  try {
    const { importId } = await params;
    
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const adminSupabase = createAdminServer();
    
    const { data: importDataRaw, error } = await adminSupabase
      .from('whatsapp_imports')
      .select('*')
      .eq('id', importId)
      .single();
    
    if (error || !importDataRaw) {
      return NextResponse.json({ error: 'Import not found' }, { status: 404 });
    }
    
    // Get linked tag if default_tag_id exists
    let linkedTag = null;
    if (importDataRaw.default_tag_id) {
      const { data: tagData } = await adminSupabase
        .from('participant_tags')
        .select('id, name, color')
        .eq('id', importDataRaw.default_tag_id)
        .single();
      linkedTag = tagData;
    }
    
    const importData = {
      ...importDataRaw,
      participant_tags: linkedTag
    };
    
    // Check org membership
    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', importData.org_id)
      .eq('user_id', user.id)
      .single();
    
    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    return NextResponse.json({ import: importData });
  } catch (error) {
    logger.error({ error }, 'Error getting WhatsApp import');
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

/**
 * PATCH /api/whatsapp/[importId]
 * 
 * Update WhatsApp import settings
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ importId: string }> }
) {
  const logger = createAPILogger(req, { endpoint: '/api/whatsapp/[importId]' });
  
  try {
    const { importId } = await params;
    const body = await req.json();
    
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const adminSupabase = createAdminServer();
    
    // Get import and verify access
    const { data: importData, error: getError } = await adminSupabase
      .from('whatsapp_imports')
      .select('id, org_id')
      .eq('id', importId)
      .single();
    
    if (getError || !importData) {
      return NextResponse.json({ error: 'Import not found' }, { status: 404 });
    }
    
    // Check admin role
    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', importData.org_id)
      .eq('user_id', user.id)
      .single();
    
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    
    // Build update object
    const updates: Record<string, any> = {};
    
    if (typeof body.show_in_menu === 'boolean') {
      updates.show_in_menu = body.show_in_menu;
    }
    
    if (body.default_tag_id !== undefined) {
      updates.default_tag_id = body.default_tag_id || null;
    }
    
    if (typeof body.notes === 'string') {
      updates.notes = body.notes;
    }
    
    if (typeof body.group_name === 'string') {
      updates.group_name = body.group_name;
    }
    
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }
    
    logger.info({ importId, updates }, 'Updating WhatsApp import settings');
    
    const { data: updated, error: updateError } = await adminSupabase
      .from('whatsapp_imports')
      .update(updates)
      .eq('id', importId)
      .select()
      .single();
    
    if (updateError) {
      logger.error({ error: updateError.message }, 'Error updating import');
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }
    
    return NextResponse.json({ import: updated });
  } catch (error) {
    logger.error({ error }, 'Error updating WhatsApp import');
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

