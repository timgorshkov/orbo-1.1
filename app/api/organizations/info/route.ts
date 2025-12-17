import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createAPILogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const logger = createAPILogger(request, { endpoint: '/api/organizations/info' });
  let orgId: string | null = null;
  try {
    const url = new URL(request.url);
    orgId = url.searchParams.get('orgId');

    if (!orgId) {
      return NextResponse.json({ error: 'Missing orgId parameter' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Supabase configuration is missing' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase
      .from('organizations')
      .select('id, name, plan, created_at')
      .eq('id', orgId)
      .maybeSingle();

    if (error) {
      logger.error({ 
        error: error.message,
        org_id: orgId
      }, 'Organization lookup error');
      return NextResponse.json({ error: 'Failed to fetch organization info' }, { status: 500 });
    }

    if (!data) {
      logger.warn({ org_id: orgId }, 'Organization not found');
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    logger.debug({ org_id: orgId }, 'Organization info fetched');
    return NextResponse.json(data);
  } catch (error: any) {
    logger.error({ 
      error: error?.message || String(error),
      stack: error?.stack,
      org_id: orgId || 'unknown'
    }, 'Error in organization info API');
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}

