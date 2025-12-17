/**
 * API: Digest Settings
 * 
 * GET: Fetch current digest settings
 * PATCH: Update digest settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClientServer } from '@/lib/server/supabaseServer';
import { createClient } from '@supabase/supabase-js';
import { createAPILogger } from '@/lib/logger';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false
    }
  }
);

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const logger = createAPILogger(request, { endpoint: '/api/organizations/[id]/digest-settings' });
  const orgId = params.id;
  try {
    const supabase = await createClientServer();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permissions
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden: owner/admin only' }, { status: 403 });
    }

    // Fetch settings
    const { data: org, error } = await supabaseAdmin
      .from('organizations')
      .select('digest_enabled, digest_day, digest_time, last_digest_sent_at, timezone')
      .eq('id', orgId)
      .single();

    if (error) {
      logger.error({ 
        error: error.message,
        org_id: orgId
      }, 'Failed to fetch digest settings');
      return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }

    logger.debug({ org_id: orgId }, 'Digest settings fetched');
    return NextResponse.json({
      enabled: org.digest_enabled ?? true,
      day: org.digest_day ?? 1,
      time: org.digest_time ?? '09:00:00',
      lastSentAt: org.last_digest_sent_at,
      timezone: org.timezone
    });

  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      org_id: orgId
    }, 'Get digest settings error');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const logger = createAPILogger(request, { endpoint: '/api/organizations/[id]/digest-settings' });
  const orgId = params.id;
  try {
    const supabase = await createClientServer();
    const body = await request.json();
    const { digest_enabled, digest_day, digest_time } = body;

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permissions (owner only for settings)
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();

    if (!membership || membership.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden: owner only' }, { status: 403 });
    }

    // Validate inputs
    if (typeof digest_enabled !== 'undefined' && typeof digest_enabled !== 'boolean') {
      return NextResponse.json({ error: 'digest_enabled must be boolean' }, { status: 400 });
    }

    if (typeof digest_day !== 'undefined' && (digest_day < 0 || digest_day > 6)) {
      return NextResponse.json({ error: 'digest_day must be 0-6' }, { status: 400 });
    }

    if (typeof digest_time !== 'undefined' && !/^\d{2}:\d{2}:\d{2}$/.test(digest_time)) {
      return NextResponse.json({ error: 'digest_time must be HH:MM:SS format' }, { status: 400 });
    }

    // Update settings
    const updates: any = {};
    if (typeof digest_enabled !== 'undefined') updates.digest_enabled = digest_enabled;
    if (typeof digest_day !== 'undefined') updates.digest_day = digest_day;
    if (typeof digest_time !== 'undefined') updates.digest_time = digest_time;

    const { error } = await supabaseAdmin
      .from('organizations')
      .update(updates)
      .eq('id', orgId);

    if (error) {
      logger.error({ 
        error: error.message,
        org_id: orgId,
        updates
      }, 'Failed to update digest settings');
      return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
    }

    logger.info({ 
      org_id: orgId,
      updates
    }, 'Digest settings updated');

    return NextResponse.json({ success: true, updates });

  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      org_id: orgId
    }, 'Update digest settings error');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

