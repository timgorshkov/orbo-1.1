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
  MessageCircle, 
  Calendar,
  ExternalLink,
  UserPlus
} from 'lucide-react'
import { ChannelAnalyticsCharts } from './channel-analytics-charts'
import { NewParticipantsList } from './new-participants-list'
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
    
    // Get simple stats from actual data
    const { data: postsData } = await adminSupabase
      .from('channel_posts')
      .select('id, views_count, reactions_count, forwards_count, comments_count')
      .eq('channel_id', channelId)
    
    const { data: subscribersData, count: subscribersCount } = await adminSupabase
      .from('channel_subscribers')
      .select('id, tg_user_id, comments_count, first_seen_at', { count: 'exact' })
      .eq('channel_id', channelId)
      .not('tg_user_id', 'in', '(777000,136817688,1087968824)') // Filter bots
    
    // Calculate stats from real data
    const totalPosts = postsData?.length || 0
    const totalComments = subscribersData?.reduce((sum, s) => sum + (s.comments_count || 0), 0) || 0
    const activeReadersCount = subscribersCount || 0
    
    // Get new participants (sorted by first_seen_at, recent first)
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const { data: newParticipants } = await adminSupabase
      .from('channel_subscribers')
      .select(`
        id,
        tg_user_id,
        username,
        first_name,
        last_name,
        reactions_count,
        comments_count,
        first_seen_at,
        last_activity_at
      `)
      .eq('channel_id', channelId)
      .gte('first_seen_at', cutoffDate.toISOString())
      .not('tg_user_id', 'in', '(777000,136817688,1087968824)') // Filter bots
      .order('first_seen_at', { ascending: false })
      .limit(20)
    
    // Get active readers (most comments, excluding bots)
    const { data: activeReaders } = await adminSupabase
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
      .not('tg_user_id', 'in', '(777000,136817688,1087968824)') // Filter bots: Telegram, Channel_Bot, GroupAnonymousBot
      .order('comments_count', { ascending: false })
      .limit(20)
    
    // Use simple stats from actual data
    const channelStats = {
      subscriber_count: channel.subscriber_count || 0,
      total_posts: totalPosts,
      total_comments: totalComments,
      active_readers: activeReadersCount
    }
    
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
        
        {/* Stats Cards - Simple 4 Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6 pb-6">
              <div className="flex items-center gap-2 text-neutral-500 mb-2">
                <Users className="h-5 w-5" />
                <span className="text-sm">Подписчики</span>
              </div>
              <p className="text-3xl font-bold">{channelStats.subscriber_count.toLocaleString()}</p>
              <p className="text-xs text-neutral-500 mt-1">Всего подписчиков канала</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6 pb-6">
              <div className="flex items-center gap-2 text-neutral-500 mb-2">
                <Calendar className="h-5 w-5" />
                <span className="text-sm">Постов</span>
              </div>
              <p className="text-3xl font-bold">{channelStats.total_posts.toLocaleString()}</p>
              <p className="text-xs text-neutral-500 mt-1">Опубликовано в канале</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6 pb-6">
              <div className="flex items-center gap-2 text-neutral-500 mb-2">
                <MessageCircle className="h-5 w-5" />
                <span className="text-sm">Комментарии</span>
              </div>
              <p className="text-3xl font-bold">{channelStats.total_comments.toLocaleString()}</p>
              <p className="text-xs text-neutral-500 mt-1">В группе обсуждений</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6 pb-6">
              <div className="flex items-center gap-2 text-neutral-500 mb-2">
                <UserPlus className="h-5 w-5" />
                <span className="text-sm">Активных</span>
              </div>
              <p className="text-3xl font-bold">{channelStats.active_readers.toLocaleString()}</p>
              <p className="text-xs text-neutral-500 mt-1">Комментаторов (участников)</p>
            </CardContent>
          </Card>
        </div>
        
        {/* Two columns: New Participants + Active Readers */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <NewParticipantsList participants={newParticipants || []} orgId={orgId} />
          <ActiveReadersList readers={activeReaders || []} orgId={orgId} />
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
