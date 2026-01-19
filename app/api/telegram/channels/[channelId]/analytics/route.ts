/**
 * Channel Analytics API
 * 
 * GET /api/telegram/channels/[channelId]/analytics - Get detailed analytics
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

interface RouteParams {
  params: { channelId: string };
}

// GET - Get channel analytics
export async function GET(request: NextRequest, { params }: RouteParams) {
  const logger = createAPILogger(request);
  const startTime = Date.now();
  const { channelId } = params;
  
  try {
    const user = await getUnifiedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('org_id');
    const days = parseInt(searchParams.get('days') || '30');
    const period = searchParams.get('period') || 'day'; // day, week, month
    
    if (!orgId) {
      return NextResponse.json({ error: 'org_id is required' }, { status: 400 });
    }
    
    const supabase = createAdminServer();
    
    // Check access via org membership
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();
    
    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    // Verify channel belongs to org
    const { data: channelOrg } = await supabase
      .from('org_telegram_channels')
      .select('track_analytics')
      .eq('org_id', orgId)
      .eq('channel_id', channelId)
      .single();
    
    if (!channelOrg) {
      return NextResponse.json({ error: 'Channel not connected to organization' }, { status: 404 });
    }
    
    // Get main stats
    const { data: stats, error: statsError } = await supabase
      .rpc('get_channel_stats', {
        p_channel_id: channelId,
        p_days: days
      })
      .single();
    
    if (statsError) {
      logger.error({ error: statsError, channel_id: channelId }, 'Failed to get channel stats');
    }
    
    // Get top posts
    const { data: topPosts, error: postsError } = await supabase
      .rpc('get_channel_top_posts', {
        p_channel_id: channelId,
        p_limit: 10,
        p_order_by: 'engagement'
      });
    
    if (postsError) {
      logger.warn({ error: postsError, channel_id: channelId }, 'Failed to get top posts');
    }
    
    // Get daily stats for chart
    const { data: dailyStats, error: dailyError } = await supabase
      .from('channel_stats_daily')
      .select('*')
      .eq('channel_id', channelId)
      .gte('date', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .order('date', { ascending: true });
    
    if (dailyError) {
      logger.warn({ error: dailyError, channel_id: channelId }, 'Failed to get daily stats');
    }
    
    // Get most active readers (by reactions)
    const { data: activeReaders, error: readersError } = await supabase
      .from('channel_subscribers')
      .select(`
        id,
        tg_user_id,
        username,
        first_name,
        last_name,
        reactions_count,
        comments_count,
        last_activity_at
      `)
      .eq('channel_id', channelId)
      .order('reactions_count', { ascending: false })
      .limit(20);
    
    if (readersError) {
      logger.warn({ error: readersError, channel_id: channelId }, 'Failed to get active readers');
    }
    
    // Get reaction breakdown for the period
    const { data: reactionBreakdown } = await supabase
      .from('channel_post_reactions')
      .select('emoji')
      .eq('channel_id', channelId)
      .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());
    
    // Count reactions by emoji
    const reactionCounts: Record<string, number> = {};
    if (reactionBreakdown) {
      for (const r of reactionBreakdown) {
        reactionCounts[r.emoji] = (reactionCounts[r.emoji] || 0) + 1;
      }
    }
    
    // Sort reactions by count
    const sortedReactions = Object.entries(reactionCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([emoji, count]) => ({ emoji, count }));
    
    logger.info({
      channel_id: channelId,
      days,
      duration: Date.now() - startTime
    }, 'Channel analytics fetched');
    
    return NextResponse.json({
      summary: stats || {
        total_posts: 0,
        total_views: 0,
        total_reactions: 0,
        total_comments: 0,
        total_forwards: 0,
        avg_views_per_post: 0,
        avg_engagement_rate: 0,
        active_readers: 0,
        subscriber_count: 0,
        subscriber_growth: 0
      },
      topPosts: topPosts || [],
      dailyStats: dailyStats || [],
      activeReaders: activeReaders || [],
      reactionBreakdown: sortedReactions,
      period: {
        days,
        startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error({ error, channel_id: channelId }, 'Error in GET /api/telegram/channels/[channelId]/analytics');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
