/**
 * Channel Posts API
 * 
 * GET /api/telegram/channels/[channelId]/posts - Get posts with metrics
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { createAPILogger } from '@/lib/logger';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

interface RouteParams {
  params: { channelId: string };
}

// GET - Get channel posts with metrics
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
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const orderBy = searchParams.get('order_by') || 'recent'; // 'recent', 'views', 'engagement', 'reactions'
    
    const supabase = createAdminServer();
    
    // Get top posts using RPC
    const { data: posts, error: postsError } = await supabase
      .rpc('get_channel_top_posts', {
        p_channel_id: channelId,
        p_limit: limit,
        p_order_by: orderBy
      });
    
    if (postsError) {
      logger.error({ error: postsError, channel_id: channelId }, 'Failed to get posts');
      return NextResponse.json({ error: 'Failed to get posts' }, { status: 500 });
    }
    
    // Get total count
    const { count: totalCount } = await supabase
      .from('channel_posts')
      .select('*', { count: 'exact', head: true })
      .eq('channel_id', channelId);
    
    logger.info({
      channel_id: channelId,
      posts_count: posts?.length || 0,
      order_by: orderBy,
      duration: Date.now() - startTime
    }, 'Channel posts fetched');
    
    return NextResponse.json({
      posts: posts || [],
      total: totalCount || 0,
      limit,
      offset
    });
  } catch (error) {
    logger.error({ error, channel_id: channelId }, 'Error in GET /api/telegram/channels/[channelId]/posts');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
