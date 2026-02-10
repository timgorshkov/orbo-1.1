/**
 * Public Application Form API (for MiniApp)
 * 
 * GET  /api/applications/forms/[formId]/public - Get form data for MiniApp
 * POST /api/applications/forms/[formId]/public - Submit application
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';

interface RouteParams {
  params: Promise<{ formId: string }>;
}

// UUID regex for validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET - Get form data for MiniApp (public, no auth required)
export async function GET(request: NextRequest, { params }: RouteParams) {
  const logger = createAPILogger(request);
  const { formId } = await params;
  
  try {
    // Validate formId format
    if (!formId || !UUID_REGEX.test(formId)) {
      logger.warn({ 
        form_id: formId,
        referrer: request.headers.get('referer'),
        user_agent: request.headers.get('user-agent')
      }, '❌ [MINIAPP] Invalid form_id format');
      return NextResponse.json({ error: 'Форма не найдена (неверный формат ID)' }, { status: 404 });
    }
    
    const { searchParams } = new URL(request.url);
    const sourceCode = searchParams.get('source') || searchParams.get('s');
    const tgUserId = searchParams.get('tg_user_id');
    
    const supabase = createAdminServer();
    
    // Use RPC function to get form data (use .single() to get object, not array)
    const { data: rpcData, error } = await supabase
      .rpc('get_application_form_public', {
        p_form_id: formId,
        p_source_code: sourceCode
      })
      .single();
    
    if (error) {
      logger.error({ error, form_id: formId }, 'Failed to get form');
      return NextResponse.json({ error: 'Failed to get form' }, { status: 500 });
    }
    
    // RPC returns JSONB directly, so rpcData is the form object
    const data = rpcData as any;
    
    if (data?.error) {
      logger.warn({ 
        form_id: formId,
        error: data.error,
        tg_user_id: tgUserId
      }, '❌ [MINIAPP] Form not found or error in RPC');
      return NextResponse.json({ error: data.error }, { status: 404 });
    }
    
    // Get form's pipeline_id first (needed for both application lookup and group info)
    const { data: formMeta } = await supabase
      .from('application_forms')
      .select('pipeline_id')
      .eq('id', formId)
      .single();
    
    const pipelineId = formMeta?.pipeline_id;
    
    // Check if user already has an application for this pipeline
    // Use pipeline_id (not form_id) so we find applications even after form recreation
    let existingApplication = null;
    if (tgUserId && pipelineId) {
      // Get all form IDs for this pipeline to find any existing application
      const { data: pipelineForms } = await supabase
        .from('application_forms')
        .select('id')
        .eq('pipeline_id', pipelineId);
      
      const pipelineFormIds = pipelineForms?.map(f => f.id) || [];
      
      if (pipelineFormIds.length > 0) {
        const { data: appData } = await supabase
          .from('applications')
          .select(`
            id,
            form_id,
            form_data,
            created_at,
            stage_id
          `)
          .in('form_id', pipelineFormIds)
          .eq('tg_user_id', tgUserId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        if (appData) {
          // If application has a different form_id, update it to the current form
          if (appData.form_id !== formId) {
            logger.info({ 
              application_id: appData.id, 
              old_form_id: appData.form_id, 
              new_form_id: formId 
            }, 'Migrating application to current form');
            
            await supabase
              .from('applications')
              .update({ form_id: formId, updated_at: new Date().toISOString() })
              .eq('id', appData.id);
          }
          
          // Get stage info
          const { data: stageData } = await supabase
            .from('pipeline_stages')
            .select('name, is_terminal, terminal_type')
            .eq('id', appData.stage_id)
            .single();
          
          existingApplication = {
            id: appData.id,
            form_data: appData.form_data,
            created_at: appData.created_at,
            stage_name: stageData?.name || 'На рассмотрении',
            is_approved: stageData?.terminal_type === 'success',
            is_rejected: stageData?.terminal_type === 'failure',
            is_pending: !stageData?.is_terminal,
            telegram_group: null as { title: string } | null
          };
          
          logger.info({ 
            form_id: formId, 
            tg_user_id: tgUserId,
            application_id: appData.id,
            stage_name: existingApplication.stage_name,
            is_pending: existingApplication.is_pending
          }, 'Existing application found for user');
        }
      }
    }
    
    // Get telegram group info for the pipeline
    let telegramGroup = null;
    const formData = formMeta; // reuse already-fetched data
    
    if (formData?.pipeline_id) {
      const { data: pipelineData } = await supabase
        .from('application_pipelines')
        .select('telegram_group_id')
        .eq('id', formData.pipeline_id)
        .single();
      
      if (pipelineData?.telegram_group_id) {
        // Note: invite_link column was removed in migration 071
        const { data: groupData } = await supabase
          .from('telegram_groups')
          .select('title')
          .eq('tg_chat_id', pipelineData.telegram_group_id)
          .single();
        
        if (groupData) {
          telegramGroup = {
            title: groupData.title
          };
        }
      }
    }
    
    // Add telegram_group to existing_application if present
    if (existingApplication && telegramGroup) {
      existingApplication.telegram_group = telegramGroup;
    }
    
    logger.info({ 
      form_id: formId, 
      has_form_schema: !!data?.form_schema,
      form_schema_length: Array.isArray(data?.form_schema) ? data.form_schema.length : 0,
      has_existing_application: !!existingApplication,
      org_name: data?.org_name,
      has_telegram_group: !!telegramGroup
    }, 'Public form processed');
    
    // Add cache-busting to org logo URL to prevent Telegram WebView from caching old images
    const responseData = { ...data };
    if (responseData.org_logo) {
      responseData.org_logo = `${String(responseData.org_logo).split('?')[0]}?v=${Date.now()}`;
    }
    
    return NextResponse.json({
      ...responseData,
      existing_application: existingApplication,
      telegram_group: telegramGroup
    });
  } catch (error) {
    logger.error({ error, form_id: formId }, 'Error in GET public form');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Submit application (from MiniApp)
export async function POST(request: NextRequest, { params }: RouteParams) {
  const logger = createAPILogger(request);
  const { formId } = await params;
  
  try {
    const body = await request.json();
    const {
      tg_user_id,
      tg_user_data,
      form_data,
      source_code,
      utm_data
    } = body;
    
    logger.info({ 
      form_id: formId, 
      tg_user_id,
      has_form_data: !!form_data,
      form_data_keys: form_data ? Object.keys(form_data) : [],
      source_code
    }, 'POST application request received');
    
    if (!tg_user_id) {
      logger.warn({ form_id: formId }, 'Missing tg_user_id');
      return NextResponse.json(
        { error: 'tg_user_id is required' },
        { status: 400 }
      );
    }
    
    const supabase = createAdminServer();
    
    // Get form to find org_id
    const { data: form, error: formError } = await supabase
      .from('application_forms')
      .select('org_id, pipeline_id, settings')
      .eq('id', formId)
      .eq('is_active', true)
      .single();
    
    if (formError || !form) {
      logger.warn({ form_id: formId, error: formError }, 'Form not found or inactive');
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }
    
    // Check if application already exists (by pipeline, not just form_id)
    // This handles the case where forms were recreated for the same pipeline
    let existingApp = null;
    
    // First try current form_id
    const { data: directMatch } = await supabase
      .from('applications')
      .select('id, form_id, stage_id, updated_at')
      .eq('form_id', formId)
      .eq('tg_user_id', tg_user_id)
      .single();
    
    if (directMatch) {
      existingApp = directMatch;
    } else if (form.pipeline_id) {
      // Look for application via any form in the same pipeline
      const { data: pipelineForms } = await supabase
        .from('application_forms')
        .select('id')
        .eq('pipeline_id', form.pipeline_id);
      
      const pipelineFormIds = pipelineForms?.map(f => f.id) || [];
      
      if (pipelineFormIds.length > 0) {
        const { data: pipelineMatch } = await supabase
          .from('applications')
          .select('id, form_id, stage_id, updated_at')
          .in('form_id', pipelineFormIds)
          .eq('tg_user_id', tg_user_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        if (pipelineMatch) {
          existingApp = pipelineMatch;
          
          // Migrate application to the current form_id
          logger.info({ 
            application_id: pipelineMatch.id, 
            old_form_id: pipelineMatch.form_id, 
            new_form_id: formId 
          }, 'Migrating application to current form (POST)');
          
          await supabase
            .from('applications')
            .update({ form_id: formId, updated_at: new Date().toISOString() })
            .eq('id', pipelineMatch.id);
        }
      }
    }
    
    if (existingApp) {
      logger.info({ 
        form_id: formId, 
        application_id: existingApp.id, 
        tg_user_id,
        has_form_data: !!form_data && Object.keys(form_data).length > 0
      }, 'Existing application found');
      
      // Rate limiting: prevent accidental double-submits (5 second cooldown)
      const lastUpdate = new Date(existingApp.updated_at);
      const now = new Date();
      const secondsSinceUpdate = (now.getTime() - lastUpdate.getTime()) / 1000;
      
      if (secondsSinceUpdate < 5) {
        logger.info({ 
          form_id: formId, 
          application_id: existingApp.id,
          seconds_since_update: secondsSinceUpdate
        }, 'Rate limited - too frequent updates');
        
        // Still return success to avoid confusion in UI
        return NextResponse.json({
          success: true,
          application_id: existingApp.id,
          is_existing: true,
          message: 'Заявка уже подана'
        });
      }
      
      // If form_data provided, update existing application (direct update, allowing re-fill)
      if (form_data && Object.keys(form_data).length > 0) {
        const { error: updateError } = await supabase
          .from('applications')
          .update({ 
            form_data: form_data,
            form_filled_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', existingApp.id);
        
        if (updateError) {
          logger.error({ 
            error: updateError, 
            form_id: formId,
            application_id: existingApp.id 
          }, 'Failed to update application');
          return NextResponse.json({ error: 'Failed to update application' }, { status: 500 });
        }
        
        // Log the event
        await supabase
          .from('application_events')
          .insert({
            application_id: existingApp.id,
            event_type: 'form_filled',
            actor_type: 'system',
            data: form_data
          });
        
        logger.info({ 
          form_id: formId, 
          application_id: existingApp.id, 
          tg_user_id 
        }, 'Existing application form data updated');
        
        return NextResponse.json({
          success: true,
          application_id: existingApp.id,
          is_existing: true,
          updated: true
        });
      }
      
      return NextResponse.json({
        success: true,
        application_id: existingApp.id,
        is_existing: true,
        message: 'Заявка уже подана'
      });
    }
    
    // Create new application
    logger.info({ form_id: formId, tg_user_id }, 'Creating new application');
    
    // Add source type to utm_data for tracking
    const enrichedUtmData = {
      source: 'miniapp',
      ...(utm_data || {})
    };
    
    const { data: applicationId, error: createError } = await supabase
      .rpc('create_application', {
        p_org_id: form.org_id,
        p_form_id: formId,
        p_tg_user_id: tg_user_id,
        p_tg_chat_id: null,
        p_tg_user_data: tg_user_data || {},
        p_form_data: form_data || {},
        p_source_code: source_code || null,
        p_utm_data: enrichedUtmData
      })
      .single();
    
    if (createError) {
      logger.error({ 
        error: createError, 
        error_code: createError.code,
        error_message: createError.message,
        form_id: formId 
      }, 'Failed to create application');
      return NextResponse.json({ error: 'Failed to create application' }, { status: 500 });
    }
    
    logger.info({ 
      form_id: formId, 
      application_id: applicationId, 
      tg_user_id,
      source: source_code 
    }, 'Application created from MiniApp');
    
    return NextResponse.json({
      success: true,
      application_id: applicationId,
      is_existing: false
    }, { status: 201 });
  } catch (error: any) {
    logger.error({ 
      error: error.message, 
      stack: error.stack,
      form_id: formId 
    }, 'Error in POST public form');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
