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
import { executeStageAutoActions } from '@/lib/services/applicationService';

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
    
    // Get application base data (no Supabase-style joins - PostgresQueryBuilder doesn't support them)
    const { data: appData, error } = await supabase
      .from('applications')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !appData) {
      logger.error({ error, application_id: id }, 'Failed to get application');
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }
    
    // Check membership
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', appData.org_id)
      .eq('user_id', user.id)
      .single();
    
    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    // Get related data separately
    const [
      { data: form },
      { data: stage },
      { data: participant },
      { data: source },
      { data: events }
    ] = await Promise.all([
      appData.form_id 
        ? supabase.from('application_forms').select('id, name, pipeline_id, form_schema').eq('id', appData.form_id).single()
        : { data: null },
      appData.stage_id
        ? supabase.from('pipeline_stages').select('id, name, slug, color, is_terminal, terminal_type').eq('id', appData.stage_id).single()
        : { data: null },
      appData.participant_id
        ? supabase.from('participants').select('id, tg_user_id, username, full_name, photo_url, email, phone, bio').eq('id', appData.participant_id).single()
        : { data: null },
      appData.source_id
        ? supabase.from('application_sources').select('id, code, utm_source, utm_medium, utm_campaign, name').eq('id', appData.source_id).single()
        : { data: null },
      supabase.from('application_events').select('id, event_type, actor_type, actor_id, data, created_at').eq('application_id', id).order('created_at', { ascending: false }).limit(50)
    ]);
    
    // Compose application object
    const application = {
      ...appData,
      form,
      stage,
      participant,
      source
    };
    
    // Get available stages for this pipeline
    const pipelineId = form?.pipeline_id;
    const { data: availableStages } = pipelineId
      ? await supabase
          .from('pipeline_stages')
          .select('id, name, slug, color, position, is_terminal, terminal_type')
          .eq('pipeline_id', pipelineId)
          .order('position')
      : { data: [] };
    
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
        is_terminal: result.is_terminal,
        terminal_type: result.terminal_type,
        auto_actions: result.auto_actions,
        auto_actions_type: typeof result.auto_actions,
        auto_actions_keys: result.auto_actions ? Object.keys(result.auto_actions) : []
      }, '📋 [API] Application stage changed - RPC response');
      
      // Determine auto-actions to execute
      // Fallback: if terminal stage has no auto_actions, derive from terminal_type
      let actionsToExecute = result.auto_actions || {};
      
      logger.info({
        application_id: id,
        is_terminal: result.is_terminal,
        terminal_type: result.terminal_type,
        has_auto_actions: !!result.auto_actions,
        auto_actions_empty: Object.keys(actionsToExecute).length === 0
      }, '🔍 [API] Checking if fallback auto-actions needed');
      
      if (result.is_terminal && Object.keys(actionsToExecute).length === 0) {
        if (result.terminal_type === 'success') {
          actionsToExecute = { approve_telegram: true };
          logger.info({ application_id: id }, '🔄 [API] Using fallback approve_telegram action');
        } else if (result.terminal_type === 'failure') {
          actionsToExecute = { reject_telegram: true };
          logger.info({ application_id: id }, '🔄 [API] Using fallback reject_telegram action');
        }
      }
      
      logger.info({
        application_id: id,
        actions_to_execute: actionsToExecute,
        actions_count: Object.keys(actionsToExecute).length
      }, '📦 [API] Final auto-actions to execute');
      
      // Execute auto-actions (approve/reject in Telegram, etc.)
      if (Object.keys(actionsToExecute).length > 0) {
        try {
          logger.info({ 
            application_id: id, 
            stage_id: stage_id,
            auto_actions: actionsToExecute 
          }, '🚀 [API] Calling executeStageAutoActions');
          
          await executeStageAutoActions(id, stage_id, actionsToExecute);
          
          logger.info({ 
            application_id: id, 
            auto_actions: actionsToExecute 
          }, '✅ [API] Auto-actions executed successfully');
        } catch (autoError) {
          logger.error({ 
            error: autoError instanceof Error ? autoError.message : String(autoError),
            stack: autoError instanceof Error ? autoError.stack : undefined,
            application_id: id 
          }, '❌ [API] Failed to execute auto-actions');
          // Don't fail the request - stage change already succeeded
        }
      } else {
        logger.warn({
          application_id: id,
          is_terminal: result.is_terminal,
          terminal_type: result.terminal_type
        }, '⚠️ [API] No auto-actions to execute');
      }
      
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
