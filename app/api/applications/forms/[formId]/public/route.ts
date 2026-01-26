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

// GET - Get form data for MiniApp (public, no auth required)
export async function GET(request: NextRequest, { params }: RouteParams) {
  const logger = createAPILogger(request);
  const { formId } = await params;
  
  try {
    const { searchParams } = new URL(request.url);
    const sourceCode = searchParams.get('source') || searchParams.get('s');
    
    const supabase = createAdminServer();
    
    // Use RPC function to get form data
    const { data, error } = await supabase
      .rpc('get_application_form_public', {
        p_form_id: formId,
        p_source_code: sourceCode
      });
    
    if (error) {
      logger.error({ error, form_id: formId }, 'Failed to get form');
      return NextResponse.json({ error: 'Failed to get form' }, { status: 500 });
    }
    
    if (data?.error) {
      return NextResponse.json({ error: data.error }, { status: 404 });
    }
    
    logger.info({ form_id: formId, source: sourceCode }, 'Public form fetched');
    
    return NextResponse.json(data);
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
    
    if (!tg_user_id) {
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
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }
    
    // Check if application already exists
    const { data: existingApp } = await supabase
      .from('applications')
      .select('id, stage_id')
      .eq('form_id', formId)
      .eq('tg_user_id', tg_user_id)
      .single();
    
    if (existingApp) {
      // If form_data provided, update existing application
      if (form_data && Object.keys(form_data).length > 0) {
        const { data: updated } = await supabase
          .rpc('submit_application_form', {
            p_application_id: existingApp.id,
            p_form_data: form_data
          });
        
        logger.info({ 
          form_id: formId, 
          application_id: existingApp.id, 
          tg_user_id 
        }, 'Existing application form submitted');
        
        return NextResponse.json({
          success: true,
          application_id: existingApp.id,
          is_existing: true
        });
      }
      
      return NextResponse.json({
        success: true,
        application_id: existingApp.id,
        is_existing: true,
        message: 'Application already exists'
      });
    }
    
    // Create new application
    const { data: applicationId, error: createError } = await supabase
      .rpc('create_application', {
        p_org_id: form.org_id,
        p_form_id: formId,
        p_tg_user_id: tg_user_id,
        p_tg_chat_id: null,
        p_tg_user_data: tg_user_data || {},
        p_form_data: form_data || {},
        p_source_code: source_code || null,
        p_utm_data: utm_data || {}
      });
    
    if (createError) {
      logger.error({ error: createError, form_id: formId }, 'Failed to create application');
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
  } catch (error) {
    logger.error({ error, form_id: formId }, 'Error in POST public form');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
