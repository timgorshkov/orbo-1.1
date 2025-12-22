/**
 * API: Archive/Unarchive Organization
 * 
 * POST /api/superadmin/organizations/[id]/archive - Archive organization
 * DELETE /api/superadmin/organizations/[id]/archive - Unarchive organization
 * 
 * Superadmin only
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { isSuperadmin } from '@/lib/server/superadminGuard';
import { getUnifiedUser } from '@/lib/auth/unified-auth';
import { createAPILogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * POST - Archive organization
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(req, { endpoint: 'superadmin/organizations/archive' });
  
  try {
    // Check superadmin
    const isAdmin = await isSuperadmin();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    const user = await getUnifiedUser();
    const { id: orgId } = await params;
    
    if (!orgId) {
      return NextResponse.json({ error: 'Organization ID required' }, { status: 400 });
    }
    
    const adminSupabase = createAdminServer();
    
    // Check if organization exists and is not already archived
    const { data: org, error: fetchError } = await adminSupabase
      .from('organizations')
      .select('id, name, status')
      .eq('id', orgId)
      .single();
    
    if (fetchError || !org) {
      logger.warn({ org_id: orgId, error: fetchError?.message }, 'Organization not found');
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }
    
    if (org.status === 'archived') {
      return NextResponse.json({ error: 'Organization is already archived' }, { status: 400 });
    }
    
    // Archive the organization
    const { error: updateError } = await adminSupabase
      .from('organizations')
      .update({
        status: 'archived',
        archived_at: new Date().toISOString(),
        archived_by: user?.id || null
      })
      .eq('id', orgId);
    
    if (updateError) {
      logger.error({ org_id: orgId, error: updateError.message }, 'Failed to archive organization');
      return NextResponse.json({ error: 'Failed to archive organization' }, { status: 500 });
    }
    
    // Get all users who were members of this org and reset their qualification if needed
    const { data: membersData } = await adminSupabase
      .from('memberships')
      .select('user_id')
      .eq('org_id', orgId);
    
    const affectedUsers: string[] = [];
    if (membersData) {
      for (const member of membersData) {
        // Call RPC to reset qualification if user has only archived orgs
        const { data: wasReset } = await adminSupabase
          .rpc('reset_qualification_if_needed', { p_user_id: member.user_id });
        
        if (wasReset) {
          affectedUsers.push(member.user_id);
        }
      }
    }
    
    logger.info({ 
      org_id: orgId, 
      org_name: org.name,
      archived_by: user?.id,
      affected_users_count: affectedUsers.length
    }, 'Organization archived');
    
    return NextResponse.json({ 
      success: true, 
      message: `Organization "${org.name}" archived successfully`,
      affectedUsers: affectedUsers.length
    });
    
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error) 
    }, 'Error archiving organization');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * DELETE - Unarchive organization
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(req, { endpoint: 'superadmin/organizations/unarchive' });
  
  try {
    // Check superadmin
    const isAdmin = await isSuperadmin();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    const user = await getUnifiedUser();
    const { id: orgId } = await params;
    
    if (!orgId) {
      return NextResponse.json({ error: 'Organization ID required' }, { status: 400 });
    }
    
    const adminSupabase = createAdminServer();
    
    // Check if organization exists and is archived
    const { data: org, error: fetchError } = await adminSupabase
      .from('organizations')
      .select('id, name, status')
      .eq('id', orgId)
      .single();
    
    if (fetchError || !org) {
      logger.warn({ org_id: orgId, error: fetchError?.message }, 'Organization not found');
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }
    
    if (org.status === 'active') {
      return NextResponse.json({ error: 'Organization is not archived' }, { status: 400 });
    }
    
    // Unarchive the organization
    const { error: updateError } = await adminSupabase
      .from('organizations')
      .update({
        status: 'active',
        archived_at: null,
        archived_by: null
      })
      .eq('id', orgId);
    
    if (updateError) {
      logger.error({ org_id: orgId, error: updateError.message }, 'Failed to unarchive organization');
      return NextResponse.json({ error: 'Failed to unarchive organization' }, { status: 500 });
    }
    
    logger.info({ 
      org_id: orgId, 
      org_name: org.name,
      unarchived_by: user?.id 
    }, 'Organization unarchived');
    
    return NextResponse.json({ 
      success: true, 
      message: `Organization "${org.name}" restored successfully` 
    });
    
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error) 
    }, 'Error unarchiving organization');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

