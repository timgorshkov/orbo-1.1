/**
 * API: Manual AI Enrichment for Participant
 * 
 * Owner/Admin can trigger AI analysis for a participant.
 * This costs money (OpenAI API), so it's manual only.
 * 
 * POST /api/participants/[participantId]/enrich-ai
 * Body: { orgId, useAI?, includeBehavior?, includeReactions?, daysBack? }
 * 
 * GET /api/participants/[participantId]/enrich-ai?orgId=...
 * Returns cost estimation
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClientServer } from '@/lib/server/supabaseServer';
import { enrichParticipant, estimateEnrichmentCost } from '@/lib/services/participantEnrichmentService';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ participantId: string }> }
) {
  try {
    const { participantId } = await params;
    const supabase = await createClientServer();
    const searchParams = request.nextUrl.searchParams;
    const orgId = searchParams.get('orgId');
    const daysBack = parseInt(searchParams.get('daysBack') || '90');
    
    if (!orgId) {
      return NextResponse.json({ error: 'orgId required' }, { status: 400 });
    }
    
    // Check permissions (owner/admin only)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();
    
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden: owner/admin only' }, { status: 403 });
    }
    
    // Estimate cost
    const estimate = await estimateEnrichmentCost(participantId, orgId, daysBack);
    
    return NextResponse.json({
      participantId,
      messageCount: estimate.messageCount,
      estimatedTokens: estimate.estimatedTokens,
      estimatedCostUsd: estimate.estimatedCostUsd,
      estimatedCostRub: estimate.estimatedCostRub,
      daysBack
    });
  } catch (error) {
    console.error('[API] Enrich AI estimation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ participantId: string }> }
) {
  try {
    const { participantId } = await params;
    const supabase = await createClientServer();
    const body = await request.json();
    const { orgId, useAI = true, includeBehavior = true, includeReactions = true, daysBack = 90 } = body;
    
    if (!orgId) {
      return NextResponse.json({ error: 'orgId required' }, { status: 400 });
    }
    
    // Check permissions (owner/admin only)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();
    
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden: owner/admin only' }, { status: 403 });
    }
    
    // Check if OPENAI_API_KEY is configured
    if (useAI && !process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured. Contact administrator.' },
        { status: 500 }
      );
    }
    
    // Run enrichment
    const result = await enrichParticipant(
      participantId, 
      orgId, 
      {
        useAI,
        includeBehavior,
        includeReactions,
        daysBack
      },
      user.id // ⭐ For OpenAI logging
    );
    
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Enrichment failed' }, { status: 500 });
    }
    
    // Return result with summary
    return NextResponse.json({
      success: true,
      participantId: result.participant_id,
      messagesAnalyzed: result.messages_analyzed,
      reactionsAnalyzed: result.reactions_analyzed,
      costUsd: result.cost_usd,
      durationMs: result.duration_ms,
      
      // Summary for UI
      summary: {
        interests: result.ai_analysis?.interests_keywords.length || 0,
        recentAsks: result.ai_analysis?.recent_asks.length || 0,
        city: result.ai_analysis?.city_inferred,
        role: result.behavioral_role?.role,
        roleConfidence: result.behavioral_role?.confidence,
        reactionSentiment: result.reaction_patterns?.sentiment
      }
    });
  } catch (error) {
    console.error('[API] Enrich AI error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

