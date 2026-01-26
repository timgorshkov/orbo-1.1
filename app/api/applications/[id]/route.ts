/**
 * Single Application API
 * 
 * GET    /api/applications/[id] - Get application details
 * PATCH  /api/applications/[id] - Update application (move stage, add notes)
 * DELETE /api/applications/[id] - Delete application
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET - Get application details
export async function GET(request: NextRequest, { params }: RouteParams) {
  const logger = createAPILogger(request);
  const { id } = await params;
  
  try {
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const supabase = createAdminServer();
    
    // Get application with related data
    const { data: application, error } = await supabase
      .from('applications')
      .select(`
        *,
        form:application_forms (
          id,
          name,
          pipeline_id,
          form_schema
        ),
        stage:pipeline_stages (
          id,
          name,
          slug,
          color,
          is_terminal,
          terminal_type
        ),
        participant:participants (
          id,
          tg_user_id,
          username,
          full_name,
          photo_url,
          email,
          phone,
          bio
        ),
        source:application_sources (
          id,
          code,
          utm_source,
          utm_medium,
          utm_campaign,
          name
        ),
        processed_by_user:users!applications_processed_by_fkey (
          id,
          email
        )
      `)
      .eq('id', id)
      .single();
    
    if (error) {
      logger.error({ error, application_id: id }, 'Failed to get application');
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }
    
    // Check membership
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', application.org_id)
      .eq('user_id', user.id)
      .single();
    
    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    // Get event history
    const { data: events } = await supabase
      .from('application_events')
      .select(`
        id,
        event_type,
        actor_type,
        actor_id,
        data,
        created_at
      `)
      .eq('application_id', id)
      .order('created_at', { ascending: false })
      .limit(50);
    
    // Get available stages for this pipeline
    const { data: availableStages } = await supabase
      .from('pipeline_stages')
      .select('id, name, slug, color, position, is_terminal, terminal_type')
      .eq('pipeline_id', application.form.pipeline_id)
      .order('position');
    
    logger.info({ application_id: id }, 'Application fetched');
    
    return NextResponse.json({
      application,
      events: events || [],
      available_stages: availableStages || []
    });
  } catch (error) {
    logger.error({ error }, 'Error in GET /api/applications/[id]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH - Update application
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const logger = createAPILogger(request);
  const { id } = await params;
  
  try {
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    const { stage_id, notes, rejection_reason } = body;
    
    const supabase = createAdminServer();
    
    // Get application
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select('org_id, stage_id')
      .eq('id', id)
      .single();
    
    if (appError || !application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }
    
    // Check admin/owner role
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', application.org_id)
      .eq('user_id', user.id)
      .single();
    
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    // If moving to new stage
    if (stage_id && stage_id !== application.stage_id) {
      const { data: result, error: moveError } = await supabase
        .rpc('move_application_to_stage', {
          p_application_id: id,
          p_new_stage_id: stage_id,
          p_actor_id: user.id,
          p_notes: notes || null
        });
      
      if (moveError) {
        logger.error({ error: moveError, application_id: id }, 'Failed to move application');
        return NextResponse.json({ error: 'Failed to update application' }, { status: 500 });
      }
      
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      
      logger.info({ 
        application_id: id, 
        new_stage_id: stage_id,
        auto_actions: result.auto_actions
      }, 'Application stage changed');
      
      return NextResponse.json({
        success: true,
        auto_actions: result.auto_actions
      });
    }
    
    // Just update notes/rejection_reason
    const updates: any = { updated_at: new Date().toISOString() };
    if (notes !== undefined) updates.notes = notes;
    if (rejection_reason !== undefined) updates.rejection_reason = rejection_reason;
    
    const { error: updateError } = await supabase
      .from('applications')
      .update(updates)
      .eq('id', id);
    
    if (updateError) {
      logger.error({ error: updateError, application_id: id }, 'Failed to update application');
      return NextResponse.json({ error: 'Failed to update application' }, { status: 500 });
    }
    
    // Log note if added
    if (notes) {
      await supabase
        .from('application_events')
        .insert({
          application_id: id,
          event_type: 'note_added',
          actor_type: 'user',
          actor_id: user.id,
          data: { notes }
        });
    }
    
    logger.info({ application_id: id }, 'Application updated');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Error in PATCH /api/applications/[id]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Delete application
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const logger = createAPILogger(request);
  const { id } = await params;
  
  try {
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const supabase = createAdminServer();
    
    // Get application
    const { data: application } = await supabase
      .from('applications')
      .select('org_id')
      .eq('id', id)
      .single();
    
    if (!application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }
    
    // Check admin/owner role
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', application.org_id)
      .eq('user_id', user.id)
      .single();
    
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    // Delete application (events will be deleted via CASCADE)
    const { error } = await supabase
      .from('applications')
      .delete()
      .eq('id', id);
    
    if (error) {
      logger.error({ error, application_id: id }, 'Failed to delete application');
      return NextResponse.json({ error: 'Failed to delete application' }, { status: 500 });
    }
    
    logger.info({ application_id: id }, 'Application deleted');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Error in DELETE /api/applications/[id]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
