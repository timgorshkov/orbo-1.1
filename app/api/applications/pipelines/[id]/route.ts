/**
 * Single Pipeline API
 * 
 * PATCH  /api/applications/pipelines/[id] - Update pipeline
 * DELETE /api/applications/pipelines/[id] - Delete pipeline
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// PATCH - Update pipeline
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const logger = createAPILogger(request);
  const { id } = await params;
  
  try {
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    const { name, description, telegram_group_id } = body;
    
    const supabase = createAdminServer();
    
    // Get pipeline
    const { data: pipeline, error: pipelineError } = await supabase
      .from('application_pipelines')
      .select('org_id')
      .eq('id', id)
      .single();
    
    if (pipelineError || !pipeline) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }
    
    // Check admin/owner role
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', pipeline.org_id)
      .eq('user_id', user.id)
      .single();
    
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    // Update pipeline
    const updates: any = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (telegram_group_id !== undefined) updates.telegram_group_id = telegram_group_id;
    
    const { error: updateError } = await supabase
      .from('application_pipelines')
      .update(updates)
      .eq('id', id);
    
    if (updateError) {
      logger.error({ error: updateError, pipeline_id: id }, 'Failed to update pipeline');
      return NextResponse.json({ error: 'Failed to update pipeline' }, { status: 500 });
    }
    
    logger.info({ pipeline_id: id }, 'Pipeline updated');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Error in PATCH /api/applications/pipelines/[id]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Delete pipeline
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const logger = createAPILogger(request);
  const { id } = await params;
  
  try {
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const supabase = createAdminServer();
    
    // Get pipeline
    const { data: pipeline, error: pipelineError } = await supabase
      .from('application_pipelines')
      .select('org_id')
      .eq('id', id)
      .single();
    
    if (pipelineError || !pipeline) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }
    
    // Check admin/owner role
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', pipeline.org_id)
      .eq('user_id', user.id)
      .single();
    
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    // Check if pipeline has forms
    const { count: formsCount } = await supabase
      .from('application_forms')
      .select('id', { count: 'exact', head: true })
      .eq('pipeline_id', id);
    
    if (formsCount && formsCount > 0) {
      return NextResponse.json(
        { error: 'Cannot delete pipeline with existing forms' },
        { status: 400 }
      );
    }
    
    // Check if pipeline has applications
    const { data: forms } = await supabase
      .from('application_forms')
      .select('id')
      .eq('pipeline_id', id);
    
    const formIds = forms?.map(f => f.id) || [];
    
    if (formIds.length > 0) {
      const { count: appsCount } = await supabase
        .from('applications')
        .select('id', { count: 'exact', head: true })
        .in('form_id', formIds);
      
      if (appsCount && appsCount > 0) {
        return NextResponse.json(
          { error: 'Cannot delete pipeline with existing applications' },
          { status: 400 }
        );
      }
    }
    
    // Delete stages (will cascade to other related data)
    await supabase
      .from('pipeline_stages')
      .delete()
      .eq('pipeline_id', id);
    
    // Delete pipeline
    const { error: deleteError } = await supabase
      .from('application_pipelines')
      .delete()
      .eq('id', id);
    
    if (deleteError) {
      logger.error({ error: deleteError, pipeline_id: id }, 'Failed to delete pipeline');
      return NextResponse.json({ error: 'Failed to delete pipeline' }, { status: 500 });
    }
    
    logger.info({ pipeline_id: id }, 'Pipeline deleted');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Error in DELETE /api/applications/pipelines/[id]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
