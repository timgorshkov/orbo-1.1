import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { getUnifiedUser } from '@/lib/auth/unified-auth';
import { QUALIFICATION_FORM_VERSION, validateResponses } from '@/lib/qualification/config';
import { logger } from '@/lib/logger';

// GET - Get user's qualification status and responses
export async function GET(request: NextRequest) {
  try {
    const user = await getUnifiedUser();
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Use admin client since NextAuth users don't have Supabase session
    const supabase = createAdminServer();
    
    const { data, error } = await supabase
      .from('user_qualification_responses')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      logger.error({ error: error.message, userId: user.id }, 'Error fetching qualification');
      return NextResponse.json(
        { error: 'Failed to fetch qualification' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      qualification: data || null,
      isCompleted: !!data?.completed_at,
      currentVersion: QUALIFICATION_FORM_VERSION,
    });
  } catch (error) {
    logger.error({ error }, 'Error in qualification GET');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Save qualification responses
export async function POST(request: NextRequest) {
  try {
    const user = await getUnifiedUser();
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { responses, complete = false } = body;

    if (!responses || typeof responses !== 'object') {
      return NextResponse.json(
        { error: 'Invalid responses format' },
        { status: 400 }
      );
    }

    // Validate if completing
    if (complete) {
      const validation = validateResponses(responses);
      if (!validation.valid) {
        return NextResponse.json(
          { 
            error: 'Missing required fields',
            missingFields: validation.missingRequired,
          },
          { status: 400 }
        );
      }
    }

    // Use admin client since NextAuth users don't have Supabase session
    const supabase = createAdminServer();

    // Upsert qualification record
    const { data, error } = await supabase
      .from('user_qualification_responses')
      .upsert(
        {
          user_id: user.id,
          responses,
          form_version: QUALIFICATION_FORM_VERSION,
          completed_at: complete ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id',
        }
      )
      .select()
      .single();

    if (error) {
      logger.error({ error: error.message, userId: user.id }, 'Error saving qualification');
      return NextResponse.json(
        { error: 'Failed to save qualification' },
        { status: 500 }
      );
    }

    logger.info({
      userId: user.id,
      complete,
      formVersion: QUALIFICATION_FORM_VERSION,
      responseKeys: Object.keys(responses),
    }, 'Qualification saved');

    return NextResponse.json({
      success: true,
      qualification: data,
      isCompleted: !!data?.completed_at,
    });
  } catch (error) {
    logger.error({ error }, 'Error in qualification POST');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH - Update specific fields in qualification
export async function PATCH(request: NextRequest) {
  try {
    const user = await getUnifiedUser();
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { responses: newResponses } = body;

    if (!newResponses || typeof newResponses !== 'object') {
      return NextResponse.json(
        { error: 'Invalid responses format' },
        { status: 400 }
      );
    }

    // Use admin client since NextAuth users don't have Supabase session
    const supabase = createAdminServer();

    // Get existing qualification
    const { data: existing } = await supabase
      .from('user_qualification_responses')
      .select('responses')
      .eq('user_id', user.id)
      .single();

    // Merge responses
    const mergedResponses = {
      ...(existing?.responses || {}),
      ...newResponses,
    };

    // Update
    const { data, error } = await supabase
      .from('user_qualification_responses')
      .upsert(
        {
          user_id: user.id,
          responses: mergedResponses,
          form_version: QUALIFICATION_FORM_VERSION,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id',
        }
      )
      .select()
      .single();

    if (error) {
      logger.error({ error: error.message, userId: user.id }, 'Error updating qualification');
      return NextResponse.json(
        { error: 'Failed to update qualification' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      qualification: data,
    });
  } catch (error) {
    logger.error({ error }, 'Error in qualification PATCH');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

