import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createAPILogger } from '@/lib/logger';
import { createClientServer } from '@/lib/server/supabaseServer';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false
    }
  }
);

export const dynamic = 'force-dynamic';

/**
 * Verify that the current user is a superadmin
 */
async function verifySuperadmin(): Promise<{ authorized: boolean; userId?: string; error?: string }> {
  try {
    const supabase = await createClientServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return { authorized: false, error: 'Unauthorized' };
    }
    
    // Check superadmin status
    const { data: superadmin, error: saError } = await supabaseAdmin
      .from('superadmins')
      .select('id')
      .eq('user_id', user.id)
      .single();
    
    if (saError || !superadmin) {
      return { authorized: false, userId: user.id, error: 'Access denied: not a superadmin' };
    }
    
    return { authorized: true, userId: user.id };
  } catch (e) {
    return { authorized: false, error: 'Authentication failed' };
  }
}

/**
 * GET /api/superadmin/errors
 * 
 * Fetch error logs with optional filters
 * 
 * Query params:
 * - level: 'error' | 'warn' | 'info'
 * - hours: number (default: 24)
 * - limit: number (default: 100)
 * - error_code: string (optional filter)
 */
export async function GET(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'superadmin/errors' });
  
  try {
    // ✅ Superadmin authentication check
    const auth = await verifySuperadmin();
    if (!auth.authorized) {
      logger.warn({ error: auth.error }, 'Unauthorized access attempt');
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }
    
    const url = new URL(req.url);
    const level = url.searchParams.get('level');
    const hours = parseInt(url.searchParams.get('hours') || '24', 10);
    const limit = parseInt(url.searchParams.get('limit') || '100', 10);
    const errorCode = url.searchParams.get('error_code');
    
    logger.info({ level, hours, limit, errorCode }, 'Fetching error logs');
    
    // Calculate time threshold
    const timeThreshold = new Date();
    timeThreshold.setHours(timeThreshold.getHours() - hours);
    
    // Build query
    let query = supabaseAdmin
      .from('error_logs')
      .select('*')
      .gte('created_at', timeThreshold.toISOString())
      .order('created_at', { ascending: false })
      .limit(limit);
    
    // Apply filters
    if (level) {
      query = query.eq('level', level);
    }
    
    if (errorCode) {
      query = query.eq('error_code', errorCode);
    }
    
    const { data: errors, error } = await query;
    
    if (error) {
      logger.error({ error }, 'Failed to fetch error logs');
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    // Get statistics
    const { data: stats } = await supabaseAdmin
      .from('error_logs')
      .select('level')
      .gte('created_at', timeThreshold.toISOString());
    
    const statistics = {
      total: stats?.length || 0,
      error: stats?.filter(s => s.level === 'error').length || 0,
      warn: stats?.filter(s => s.level === 'warn').length || 0,
      info: stats?.filter(s => s.level === 'info').length || 0,
    };
    
    logger.info({ 
      errorsCount: errors?.length || 0, 
      statistics 
    }, 'Error logs fetched successfully');
    
    return NextResponse.json({
      ok: true,
      errors: errors || [],
      statistics,
      filters: {
        level,
        hours,
        limit,
        error_code: errorCode
      }
    });
  } catch (error) {
    logger.error({ error }, 'Unexpected error fetching error logs');
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

/**
 * PATCH /api/superadmin/errors/:id
 * 
 * Mark error as resolved
 */
export async function PATCH(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'superadmin/errors' });
  
  try {
    const body = await req.json();
    const { id, resolved } = body;
    
    if (!id) {
      return NextResponse.json({ error: 'Missing error ID' }, { status: 400 });
    }
    
    logger.info({ errorId: id, resolved }, 'Marking error as resolved');
    
    const { error } = await supabaseAdmin
      .from('error_logs')
      .update({
        resolved_at: resolved ? new Date().toISOString() : null
      })
      .eq('id', id);
    
    if (error) {
      logger.error({ error }, 'Failed to update error log');
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    logger.info({ errorId: id }, 'Error marked as resolved');
    
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error({ error }, 'Unexpected error updating error log');
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

