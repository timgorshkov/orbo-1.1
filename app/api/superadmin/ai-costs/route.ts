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
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

const supabaseAdmin = createAdminServer();

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
    
    const supabase = createAdminServer();
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);
    
    // Получаем логи напрямую из таблицы
    const { data: logsData, error: logsError } = await supabase
      .from('openai_api_logs')
      .select('*')
      .gte('created_at', dateFrom.toISOString())
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (logsError) {
      logger.error({ error: logsError.message, code: logsError.code }, 'Error loading logs');
    }
    
    // Вычисляем summary из логов
    const logs = logsData || [];
    const totalCost = logs.reduce((sum: number, log: any) => sum + (parseFloat(log.cost_usd) || 0), 0);
    const totalPromptTokens = logs.reduce((sum: number, log: any) => sum + (parseInt(log.prompt_tokens) || 0), 0);
    const totalCompletionTokens = logs.reduce((sum: number, log: any) => sum + (parseInt(log.completion_tokens) || 0), 0);
    
    const summaryData = {
      total_cost_usd: totalCost,
      total_prompt_tokens: totalPromptTokens,
      total_completion_tokens: totalCompletionTokens,
      total_requests: logs.length,
      period_days: days
    };
    
    return NextResponse.json({
      summary: summaryData,
      logs: logs,
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

