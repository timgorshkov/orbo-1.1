import { NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { participantMatcher } from '@/lib/services/participants/matcher';
import { PostgrestSingleResponse } from '@supabase/supabase-js';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';
// REMOVED: logParticipantAudit - audit logging removed in migration 072

async function ensureOrgAccess(orgId: string) {
  const user = await getUnifiedUser();

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const adminSupabase = createAdminServer();
  const { data: membership } = await adminSupabase
    .from('memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership) {
    return { error: NextResponse.json({ error: 'Access denied' }, { status: 403 }) };
  }

  return { user };
}

function normalizePhone(input?: string | null): string | null {
  if (!input) return null;
  const digits = input.replace(/\D+/g, '');
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith('8')) {
    return `+7${digits.substring(1)}`;
  }
  if (digits.length === 10) {
    return `+7${digits}`;
  }
  if (digits.startsWith('7') && digits.length === 11) {
    return `+${digits}`;
  }
  return `+${digits}`;
}

function normalizeEmail(email?: string | null): string | null {
  return email ? email.trim().toLowerCase() : null;
}

export async function POST(request: Request) {
  const logger = createAPILogger(request, { endpoint: '/api/participants/create' });
  let orgId: string | undefined;
  try {
    const supabaseAdmin = createAdminServer();
    
    const payload = await request.json();
    orgId = payload?.orgId as string | undefined;

    if (!orgId) {
      return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
    }

    const access = await ensureOrgAccess(orgId);
    if ('error' in access) {
      return access.error;
    }

    const email = normalizeEmail(payload?.email);
    const phone = normalizePhone(payload?.phone);
    const username = payload?.username?.trim()?.replace(/^@/, '') || null;
    const tgUserId = payload?.tg_user_id ? Number(payload.tg_user_id) : null;
    const firstName = payload?.first_name?.trim() || null;
    const lastName = payload?.last_name?.trim() || null;
    const fullName = payload?.full_name?.trim() || [firstName, lastName].filter(Boolean).join(' ') || null;
    const source = payload?.source?.trim() || 'manual';
    const status = payload?.status?.trim() || 'active';
    const notes = payload?.notes?.trim() || null;

    const matchIntent = {
      orgId,
      email,
      phone,
      username,
      tg_user_id: tgUserId,
      full_name: fullName,
      first_name: firstName,
      last_name: lastName
    };

    const matches = await participantMatcher.findMatches(matchIntent);

    if (!payload?.force && matches.length > 0) {
      return NextResponse.json({
        duplicatesFound: true,
        matches
      });
    }

    const insertPayload = {
      org_id: orgId,
      full_name: fullName,
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      username,
      tg_user_id: tgUserId,
      source,
      status,
      notes,
      created_at: new Date().toISOString()
    };

    const { data: inserted, error: insertError } = (await supabaseAdmin
      .from('participants')
      .insert(insertPayload)
      .select('id')) as PostgrestSingleResponse<{ id: string }[]>;

    if (insertError) {
      logger.error({ error: insertError.message, org_id: orgId }, 'Error inserting participant');
      return NextResponse.json({ error: 'Failed to create participant' }, { status: 500 });
    }

    const participantId = inserted?.[0]?.id;

    // REMOVED: Audit logging (migration 072)
    // participant_audit_log table and logParticipantAudit function removed
    if (participantId) {
      logger.info({ 
        participant_id: participantId, 
        full_name: fullName || 'Unnamed', 
        source: source || 'manual',
        org_id: orgId
      }, '[Participant Created]');
    }

    return NextResponse.json({
      success: true,
      participantId
    });
  } catch (error: any) {
    logger.error({ 
      error: error?.message || String(error),
      stack: error?.stack,
      org_id: orgId || 'unknown'
    }, 'Error creating participant');
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}

