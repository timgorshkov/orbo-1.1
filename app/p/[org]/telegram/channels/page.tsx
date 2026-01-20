import { requireOrgAccess } from '@/lib/orgGuard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TabsLayout from '../tabs-layout'
import { createServiceLogger } from '@/lib/logger'
import { Plus, Users, Eye, Heart, TrendingUp, Radio, BarChart3 } from 'lucide-react'
import { AddChannelDialog } from './add-channel-dialog'
import { RemoveChannelButton } from '@/components/telegram-channel-actions'

type TelegramChannel = {
  id: string
  tg_chat_id: number
  username: string | null
  title: string
  description: string | null
  subscriber_count: number
  bot_status: 'connected' | 'pending' | 'kicked' | 'error' | null
  last_post_at: string | null
  photo_url: string | null
  // Stats from join
  posts_count?: number
  total_views?: number
}

export default async function ChannelsPage({ params }: { params: Promise<{ org: string }> }) {
  const logger = createServiceLogger('ChannelsPage')
  
  try {
    const { org: orgId } = await params
    const { supabase, role } = await requireOrgAccess(orgId)
    
    // Only owner and admin can manage channels
    if (role !== 'owner' && role !== 'admin') {
      return notFound()
    }
    
    const adminSupabase = createAdminServer()
    
    // Get channels for this org using RPC
    const { data: channels, error } = await adminSupabase
      .rpc('get_org_channels', { p_org_id: orgId })
    
    if (error) {
      logger.error({ error, org_id: orgId }, 'Error fetching channels')
    }
    
    const channelList = (channels || []) as TelegramChannel[]
    
    // Calculate totals
    const totalSubscribers = channelList.reduce((sum, ch) => sum + (ch.subscriber_count || 0), 0)
    const totalPosts = channelList.reduce((sum, ch) => sum + (ch.posts_count || 0), 0)
    const totalViews = channelList.reduce((sum, ch) => sum + (ch.total_views || 0), 0)
    
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Настройки мессенджеров</h1>
        </div>
        
        <TabsLayout orgId={orgId}>
          <div className="space-y-6">
            {/* Stats Summary */}
            {channelList.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Radio className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{channelList.length}</p>
                        <p className="text-sm text-neutral-500">Каналов</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-100 rounded-lg">
                        <Users className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{totalSubscribers.toLocaleString()}</p>
                        <p className="text-sm text-neutral-500">Подписчиков</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-100 rounded-lg">
                        <Eye className="h-5 w-5 text-purple-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{totalViews.toLocaleString()}</p>
                        <p className="text-sm text-neutral-500">Просмотров</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-amber-100 rounded-lg">
                        <TrendingUp className="h-5 w-5 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{totalPosts.toLocaleString()}</p>
                        <p className="text-sm text-neutral-500">Постов</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
            
            {/* Add Channel Card */}
            <Card>
              <CardHeader>
                <CardTitle>Подключение Telegram-канала</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-neutral-600 space-y-3">
                  <p>
                    <strong className="font-medium">1)</strong> Добавьте бота в ваш канал как администратора с правами на чтение сообщений.
                  </p>
                  <p className="bg-neutral-50 rounded p-2 font-mono">
                    @orbo_community_bot
                  </p>
                  <p>
                    <strong className="font-medium">2)</strong> Нажмите «Добавить канал» и введите username или ID канала.
                  </p>
                </div>
                
                <AddChannelDialog orgId={orgId} />
              </CardContent>
            </Card>
            
            {/* Channels List */}
            {channelList.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Подключённые каналы</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {channelList.map(channel => (
                      <div 
                        key={channel.id} 
                        className="border rounded-lg p-4 hover:bg-neutral-50 transition-colors"
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex gap-3">
                            {channel.photo_url ? (
                              <img 
                                src={channel.photo_url} 
                                alt={channel.title}
                                className="w-12 h-12 rounded-lg object-cover"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
                                {channel.title.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <h3 className="font-medium">{channel.title}</h3>
                              {channel.username && (
                                <p className="text-sm text-neutral-500">@{channel.username}</p>
                              )}
                              <div className="flex items-center gap-4 mt-1">
                                <span className="flex items-center gap-1 text-sm text-neutral-600">
                                  <Users className="h-3.5 w-3.5" />
                                  {(channel.subscriber_count || 0).toLocaleString()}
                                </span>
                                {channel.posts_count !== undefined && (
                                  <span className="flex items-center gap-1 text-sm text-neutral-600">
                                    <TrendingUp className="h-3.5 w-3.5" />
                                    {channel.posts_count} постов
                                  </span>
                                )}
                                {channel.total_views !== undefined && (
                                  <span className="flex items-center gap-1 text-sm text-neutral-600">
                                    <Eye className="h-3.5 w-3.5" />
                                    {channel.total_views.toLocaleString()} просмотров
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span 
                              className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                channel.bot_status === 'connected' 
                                  ? 'bg-green-100 text-green-800' 
                                  : channel.bot_status === 'pending'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {channel.bot_status === 'connected' ? 'Подключён' : 
                               channel.bot_status === 'pending' ? 'Ожидание' : 'Ошибка'}
                            </span>
                          </div>
                        </div>
                        
                        {channel.last_post_at && (
                          <div className="mt-2 text-xs text-neutral-500">
                            Последний пост: {new Date(channel.last_post_at).toLocaleString('ru')}
                          </div>
                        )}
                        
                        {/* Action Buttons */}
                        <div className="flex gap-2 mt-4 pt-4 border-t">
                          <Link href={`/p/${orgId}/telegram/channels/${channel.id}`} className="flex-1">
                            <Button variant="default" className="w-full">
                              <BarChart3 className="h-4 w-4 mr-2" />
                              Статистика
                            </Button>
                          </Link>
                          <RemoveChannelButton
                            channelId={channel.id}
                            channelTitle={channel.title}
                            orgId={orgId}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Radio className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-neutral-900 mb-2">
                    Нет подключённых каналов
                  </h3>
                  <p className="text-neutral-500 mb-4">
                    Добавьте Telegram-канал, чтобы отслеживать статистику и аналитику
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsLayout>
      </div>
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (errorMessage === 'Unauthorized' || errorMessage === 'Forbidden') {
      return notFound()
    }
    const logger = createServiceLogger('ChannelsPage')
    logger.error({ error: errorMessage }, 'Channels page error')
    return notFound()
  }
}
