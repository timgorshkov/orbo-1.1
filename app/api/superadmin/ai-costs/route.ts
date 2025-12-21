/**
 * API: Superadmin AI Costs
 * 
 * Fetch OpenAI API logs and cost summary for superadmins
 * 
 * GET /api/superadmin/ai-costs?days=30
 * 
 * ⚡ Использует unified auth для поддержки OAuth
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/superadmin/ai-costs' });
  
  try {
    // Check if user is superadmin via unified auth
    const user = await getUnifiedUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { data: isSuperadmin } = await supabaseAdmin
      .from('superadmins')
      .select('user_id')
      .eq('user_id', user.id)
      .single();
    
    if (!isSuperadmin) {
      return NextResponse.json({ error: 'Superadmin access required' }, { status: 403 });
    }
    
    // Get query params
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '30', 10);
    
    logger.debug({ days }, 'Fetching AI costs');
    
    // Fetch summary via RPC
    const { data: summaryData, error: summaryError } = await supabaseAdmin
      .rpc('get_openai_cost_summary', { p_org_id: null, p_days: days })
      .single();
    
    if (summaryError) {
      logger.error({ error: summaryError.message, code: summaryError.code }, 'Error loading summary');
    }
    
    // Fetch recent logs via RPC
    const { data: logsData, error: logsError } = await supabaseAdmin
      .rpc('get_openai_api_logs', { p_org_id: null, p_limit: 50 });
    
    if (logsError) {
      logger.error({ error: logsError.message, code: logsError.code }, 'Error loading logs');
    }
    
    return NextResponse.json({
      summary: summaryData || null,
      logs: logsData || [],
      filters: { days }
    });
    
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error)
    }, 'AI costs fetch failed');
    
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

