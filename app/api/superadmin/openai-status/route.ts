/**
 * API: OpenAI Configuration Status
 * 
 * Diagnostic endpoint for superadmins to check OpenAI configuration.
 * Checks:
 * - OPENAI_API_KEY presence
 * - OPENAI_PROXY_URL presence
 * - Recent logs count
 * - Test API call (optional)
 * 
 * GET /api/superadmin/openai-status
 * 
 * ⚡ ОБНОВЛЕНО: Использует unified auth для поддержки OAuth
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

const supabaseAdmin = createAdminServer();

export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/superadmin/openai-status' });
  
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
    
    // Check environment variables
    const apiKey = process.env.OPENAI_API_KEY;
    const proxyUrl = process.env.OPENAI_PROXY_URL;
    
    // Mask sensitive values for security
    const config = {
      openai_api_key: {
        set: !!apiKey,
        prefix: apiKey ? apiKey.substring(0, 7) + '...' : null,
        length: apiKey ? apiKey.length : 0
      },
      openai_proxy_url: {
        set: !!proxyUrl,
        host: proxyUrl ? proxyUrl.replace(/^https?:\/\/[^@]*@/, '').split(':')[0] : null
      }
    };
    
    // Get recent logs stats (using service role to bypass RLS)
    const { data: logsStats, error: logsError } = await supabaseAdmin
      .from('openai_api_logs')
      .select('id, created_at, request_type')
      .order('created_at', { ascending: false })
      .limit(10);
    
    const recentLogs = {
      count: logsStats?.length || 0,
      lastLog: logsStats?.[0]?.created_at || null,
      lastLogType: logsStats?.[0]?.request_type || null,
      error: logsError?.message || null
    };
    
    // Get total logs count for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { count: totalLogs30Days } = await supabaseAdmin
      .from('openai_api_logs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', thirtyDaysAgo.toISOString());
    
    // Diagnostics summary
    const diagnostics = {
      status: 'unknown',
      issues: [] as string[],
      recommendations: [] as string[]
    };
    
    if (!apiKey) {
      diagnostics.issues.push('OPENAI_API_KEY is not set');
      diagnostics.recommendations.push('Add OPENAI_API_KEY to .env file');
    }
    
    if (!proxyUrl) {
      diagnostics.issues.push('OPENAI_PROXY_URL is not set');
      diagnostics.recommendations.push('Add OPENAI_PROXY_URL to .env file (required for Russia)');
    }
    
    if (recentLogs.count === 0 && apiKey) {
      diagnostics.issues.push('No logs in last 10 records - OpenAI calls may be failing');
      if (!proxyUrl) {
        diagnostics.recommendations.push('Configure proxy URL to access OpenAI from Russia');
      } else {
        diagnostics.recommendations.push('Check Docker logs for OpenAI-related errors');
      }
    }
    
    if (diagnostics.issues.length === 0) {
      diagnostics.status = 'ok';
    } else if (diagnostics.issues.some(i => i.includes('not set'))) {
      diagnostics.status = 'config_error';
    } else {
      diagnostics.status = 'warning';
    }
    
    logger.info({
      diagnostics_status: diagnostics.status,
      has_api_key: !!apiKey,
      has_proxy: !!proxyUrl,
      recent_logs_count: recentLogs.count
    }, 'OpenAI status check');
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      config,
      logs: {
        recent: recentLogs,
        last30Days: totalLogs30Days || 0
      },
      diagnostics
    });
    
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error)
    }, 'OpenAI status check failed');
    
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

