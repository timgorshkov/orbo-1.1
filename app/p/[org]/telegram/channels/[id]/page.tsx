import { requireOrgAccess } from '@/lib/orgGuard'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServiceLogger } from '@/lib/logger'
import { 
  ArrowLeft, 
  Users, 
  Eye, 
  Heart, 
  MessageCircle, 
  Share2, 
  TrendingUp,
  TrendingDown,
  Calendar,
  ExternalLink
} from 'lucide-react'
import { ChannelAnalyticsCharts } from './channel-analytics-charts'
import { TopPostsList } from './top-posts-list'
import { ActiveReadersList } from './active-readers-list'

interface ChannelStats {
  total_posts: number
  total_views: number
  total_reactions: number
  total_comments: number
  total_forwards: number
  avg_views_per_post: number
  avg_engagement_rate: number
  active_readers: number
  subscriber_count: number
  subscriber_growth: number
}

export default async function ChannelDetailPage({ 
  params,
  searchParams 
}: { 
  params: Promise<{ org: string; id: string }>
  searchParams: Promise<{ days?: string }>
}) {
  const logger = createServiceLogger('ChannelDetailPage')
  
  try {
    const { org: orgId, id: channelId } = await params
    const { days: daysParam } = await searchParams
    const days = parseInt(daysParam || '30')
    
    const { supabase, role } = await requireOrgAccess(orgId)
    
    if (role !== 'owner' && role !== 'admin') {
      return notFound()
    }
    
    const adminSupabase = createAdminServer()
    
    // Get channel details
    const { data: channel, error: channelError } = await adminSupabase
      .from('telegram_channels')
      .select(`
        id,
        tg_chat_id,
        username,
        title,
        description,
        subscriber_count,
        subscriber_count_updated_at,
        linked_chat_id,
        bot_status,
        photo_url,
        last_post_at,
        created_at
      `)
      .eq('id', channelId)
      .single()
    
    if (channelError || !channel) {
      logger.error({ error: channelError, channel_id: channelId }, 'Channel not found')
      return notFound()
    }
    
    // Check if channel belongs to this org
    const { data: orgConnection } = await adminSupabase
      .from('org_telegram_channels')
      .select('is_primary, track_analytics, created_at')
      .eq('org_id', orgId)
      .eq('channel_id', channelId)
      .single()
    
    if (!orgConnection) {
      logger.warn({ org_id: orgId, channel_id: channelId }, 'Channel not connected to org')
      return notFound()
    }
    
    // Get stats
    const { data: stats } = await adminSupabase
      .rpc('get_channel_stats', {
        p_channel_id: channelId,
        p_days: days
      })
      .single() as { data: ChannelStats | null }
    
    // Get top posts
    const { data: topPosts } = await adminSupabase
      .rpc('get_channel_top_posts', {
        p_channel_id: channelId,
        p_limit: 10,
        p_order_by: 'engagement'
      })
    
    // Get daily stats for charts
    const { data: dailyStats } = await adminSupabase
      .from('channel_stats_daily')
      .select('*')
      .eq('channel_id', channelId)
      .gte('date', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .order('date', { ascending: true })
    
    // Get active readers
    const { data: activeReaders } = await adminSupabase
      .from('channel_subscribers')
      .select(`
        id,
        tg_user_id,
        username,
        first_name,
        last_name,
        total_reactions,
        total_comments,
        engagement_score,
        last_activity_at
      `)
      .eq('channel_id', channelId)
      .order('engagement_score', { ascending: false })
      .limit(20)
    
    const defaultStats: ChannelStats = {
      total_posts: 0,
      total_views: 0,
      total_reactions: 0,
      total_comments: 0,
      total_forwards: 0,
      avg_views_per_post: 0,
      avg_engagement_rate: 0,
      active_readers: 0,
      subscriber_count: channel.subscriber_count || 0,
      subscriber_growth: 0
    }
    
    const channelStats: ChannelStats = stats ? { ...defaultStats, ...stats } : defaultStats
    
    return (
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <Link 
            href={`/p/${orgId}/telegram/channels`}
            className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-700 mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Назад к каналам
          </Link>
          
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              {channel.photo_url ? (
                <img 
                  src={channel.photo_url} 
                  alt={channel.title}
                  className="w-16 h-16 rounded-xl object-cover"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-2xl">
                  {channel.title.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <h1 className="text-2xl font-semibold">{channel.title}</h1>
                {channel.username && (
                  <a 
                    href={`https://t.me/${channel.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline flex items-center gap-1"
                  >
                    @{channel.username}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {channel.description && (
                  <p className="text-sm text-neutral-500 mt-1 max-w-xl line-clamp-2">
                    {channel.description}
                  </p>
                )}
              </div>
            </div>
            
            {/* Period selector */}
            <div className="flex gap-2">
              {[7, 30, 90].map(d => (
                <Link
                  key={d}
                  href={`/p/${orgId}/telegram/channels/${channelId}?days=${d}`}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    days === d 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                  }`}
                >
                  {d} дней
                </Link>
              ))}
            </div>
          </div>
        </div>
        
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 text-neutral-500 mb-1">
                <Users className="h-4 w-4" />
                <span className="text-xs">Подписчики</span>
              </div>
              <p className="text-xl font-bold">{channelStats.subscriber_count.toLocaleString()}</p>
              {channelStats.subscriber_growth !== 0 && (
                <p className={`text-xs flex items-center gap-1 ${
                  channelStats.subscriber_growth > 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {channelStats.subscriber_growth > 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {channelStats.subscriber_growth > 0 ? '+' : ''}{channelStats.subscriber_growth}
                </p>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 text-neutral-500 mb-1">
                <Calendar className="h-4 w-4" />
                <span className="text-xs">Постов</span>
              </div>
              <p className="text-xl font-bold">{channelStats.total_posts.toLocaleString()}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 text-neutral-500 mb-1">
                <Eye className="h-4 w-4" />
                <span className="text-xs">Просмотры</span>
              </div>
              <p className="text-xl font-bold">{channelStats.total_views.toLocaleString()}</p>
              <p className="text-xs text-neutral-500">
                ~{Math.round(channelStats.avg_views_per_post).toLocaleString()} / пост
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 text-neutral-500 mb-1">
                <Heart className="h-4 w-4" />
                <span className="text-xs">Реакции</span>
              </div>
              <p className="text-xl font-bold">{channelStats.total_reactions.toLocaleString()}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 text-neutral-500 mb-1">
                <MessageCircle className="h-4 w-4" />
                <span className="text-xs">Комментарии</span>
              </div>
              <p className="text-xl font-bold">{channelStats.total_comments.toLocaleString()}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 text-neutral-500 mb-1">
                <Share2 className="h-4 w-4" />
                <span className="text-xs">Репосты</span>
              </div>
              <p className="text-xl font-bold">{channelStats.total_forwards.toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>
        
        {/* Engagement Rate Banner */}
        <Card className="mb-6 bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-600">Средняя вовлечённость (ER)</p>
                <p className="text-3xl font-bold text-blue-600">
                  {(channelStats.avg_engagement_rate * 100).toFixed(2)}%
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-neutral-600">Активных читателей</p>
                <p className="text-3xl font-bold text-purple-600">
                  {channelStats.active_readers.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Charts */}
        {dailyStats && dailyStats.length > 0 && (
          <ChannelAnalyticsCharts dailyStats={dailyStats} />
        )}
        
        {/* Two columns: Top Posts + Active Readers */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <TopPostsList posts={topPosts || []} channelUsername={channel.username} />
          <ActiveReadersList readers={activeReaders || []} />
        </div>
      </div>
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (errorMessage === 'Unauthorized' || errorMessage === 'Forbidden') {
      return notFound()
    }
    const logger = createServiceLogger('ChannelDetailPage')
    logger.error({ error: errorMessage }, 'Channel detail page error')
    return notFound()
  }
}
