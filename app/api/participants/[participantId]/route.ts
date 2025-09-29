import { NextResponse } from 'next/server';
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer';
import { getParticipantDetail } from '@/lib/server/getParticipantDetail';
import type { SupabaseClient } from '@supabase/supabase-js';

async function ensureOrgAccess(orgId: string) {
  const supabase = createClientServer();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const adminClient = createAdminServer();

  const { data: membership, error: membershipError } = await adminClient
    .from('memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (membershipError) {
    console.error('Membership check error:', membershipError);
    return { user: null, error: NextResponse.json({ error: 'Failed to verify membership' }, { status: 500 }) };
  }

  if (!membership) {
    return { user: null, error: NextResponse.json({ error: 'Access denied' }, { status: 403 }) };
  }

  return { user, adminClient };
}

export async function GET(request: Request, { params }: { params: { participantId: string } }) {
  try {
    const url = new URL(request.url);
    const orgId = url.searchParams.get('orgId');
    const participantId = params.participantId;

    if (!orgId || !participantId) {
      return NextResponse.json({ error: 'Missing orgId or participantId' }, { status: 400 });
    }

    const { error } = await ensureOrgAccess(orgId);
    if (error) return error;

    const detail = await getParticipantDetail(orgId, participantId);

    if (!detail) {
      return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error: any) {
    console.error('Error in participant GET:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: { participantId: string } }) {
  try {
    const payload = await request.json();
    const orgId = payload?.orgId;
    const participantId = params.participantId;

    if (!orgId || !participantId) {
      return NextResponse.json({ error: 'Missing orgId or participantId' }, { status: 400 });
    }

    const { adminClient, user, error } = await ensureOrgAccess(orgId);
    if (error) return error;
    if (!adminClient || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const updatePayload: Record<string, any> = {};
    const allowedFields = ['full_name', 'username', 'email', 'phone', 'activity_score', 'risk_score'];
    allowedFields.forEach(field => {
      if (field in payload) {
        updatePayload[field] = payload[field];
      }
    });

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    updatePayload.updated_by = user.id;
    updatePayload.last_activity_at = payload?.last_activity_at ?? updatePayload.last_activity_at;

    const { data: updatedParticipant, error: updateError } = await adminClient
      .from('participants')
      .update(updatePayload)
      .eq('org_id', orgId)
      .eq('id', participantId)
      .select('*')
      .maybeSingle();

    if (updateError) {
      console.error('Error updating participant:', updateError);
      return NextResponse.json({ error: 'Failed to update participant' }, { status: 500 });
    }

    const detail = await getParticipantDetail(orgId, participantId);

    return NextResponse.json({ success: true, participant: updatedParticipant, detail });
  } catch (error: any) {
    console.error('Error in participant PUT:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { participantId: string } }) {
  try {
    const payload = await request.json();
    const orgId = payload?.orgId;
    const participantId = params.participantId;

    if (!orgId || !participantId) {
      return NextResponse.json({ error: 'Missing orgId or participantId' }, { status: 400 });
    }

    const { adminClient, user, error } = await ensureOrgAccess(orgId);
    if (error) return error;
    if (!adminClient || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action } = payload || {};

    switch (action) {
      case 'addTrait':
        return handleAddTrait(adminClient, user.id, orgId, participantId, payload);
      case 'removeTrait':
        return handleRemoveTrait(adminClient, orgId, participantId, payload);
      case 'mergeDuplicates':
        return handleMergeParticipants(adminClient, user.id, orgId, participantId, payload);
      default:
        return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Error in participant PATCH:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}

async function handleAddTrait(supabase: SupabaseClient, actorId: string, orgId: string, participantId: string, payload: any) {
  const { key, value, valueType, source, confidence, metadata } = payload || {};

  if (!key || !value) {
    return NextResponse.json({ error: 'Missing trait key or value' }, { status: 400 });
  }

  const { data: participantRecord, error: participantError } = await supabase
    .from('participants')
    .select('id, merged_into')
    .eq('org_id', orgId)
    .eq('id', participantId)
    .maybeSingle();

  if (participantError || !participantRecord) {
    return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
  }

  const canonicalId = participantRecord.merged_into || participantRecord.id;

  const { data: trait, error: traitError } = await supabase
    .rpc('upsert_participant_trait', {
      p_participant_id: canonicalId,
      p_trait_key: key,
      p_trait_value: value,
      p_value_type: valueType ?? 'text',
      p_source: source ?? 'manual',
      p_confidence: confidence ?? null,
      p_metadata: metadata ?? null,
      p_user_id: actorId
    });

  if (traitError) {
    console.error('Error upserting participant trait:', traitError);
    return NextResponse.json({ error: 'Failed to upsert trait' }, { status: 500 });
  }

  const detail = await getParticipantDetail(orgId, participantId);

  return NextResponse.json({ success: true, trait, detail });
}

async function handleRemoveTrait(supabase: SupabaseClient, orgId: string, participantId: string, payload: any) {
  const { traitId } = payload || {};

  if (!traitId) {
    return NextResponse.json({ error: 'Missing traitId' }, { status: 400 });
  }

  const { data: participantRecord, error: participantError } = await supabase
    .from('participants')
    .select('id, merged_into')
    .eq('org_id', orgId)
    .eq('id', participantId)
    .maybeSingle();

  if (participantError || !participantRecord) {
    return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
  }

  const canonicalId = participantRecord.merged_into || participantRecord.id;

  const { error: deleteError } = await supabase
    .from('participant_traits')
    .delete()
    .eq('id', traitId)
    .eq('participant_id', canonicalId);

  if (deleteError) {
    console.error('Error deleting participant trait:', deleteError);
    return NextResponse.json({ error: 'Failed to delete trait' }, { status: 500 });
  }

  const detail = await getParticipantDetail(orgId, participantId);

  return NextResponse.json({ success: true, detail });
}

async function handleMergeParticipants(supabase: SupabaseClient, actorId: string, orgId: string, participantId: string, payload: any) {
  const { duplicates } = payload || {};

  if (!Array.isArray(duplicates) || duplicates.length === 0) {
    return NextResponse.json({ error: 'No duplicates provided' }, { status: 400 });
  }

  const { data: participantRecord, error: participantError } = await supabase
    .from('participants')
    .select('id, merged_into')
    .eq('org_id', orgId)
    .eq('id', participantId)
    .maybeSingle();

  if (participantError || !participantRecord) {
    return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
  }

  const canonicalId = participantRecord.merged_into || participantRecord.id;

  const { error: mergeError } = await supabase
    .rpc('merge_participants', {
      p_target: canonicalId,
      p_duplicates: duplicates,
      p_actor: actorId
    });

  if (mergeError) {
    console.error('Error merging participants:', mergeError);
    return NextResponse.json({ error: 'Failed to merge participants' }, { status: 500 });
  }

  const detail = await getParticipantDetail(orgId, participantId);

  return NextResponse.json({ success: true, detail });
}
