'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useMemo } from 'react'

interface DailyStat {
  date: string
  views_count: number
  reactions_count: number
  comments_count: number
  forwards_count: number
  posts_count: number
  subscriber_count: number
}

interface ChannelAnalyticsChartsProps {
  dailyStats: DailyStat[]
}

export function ChannelAnalyticsCharts({ dailyStats }: ChannelAnalyticsChartsProps) {
  // Calculate max values for scaling
  const maxViews = useMemo(() => 
    Math.max(...dailyStats.map(s => s.views_count || 0), 1),
    [dailyStats]
  )
  
  const maxEngagement = useMemo(() => 
    Math.max(...dailyStats.map(s => (s.reactions_count || 0) + (s.comments_count || 0)), 1),
    [dailyStats]
  )
  
  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('ru', { day: 'numeric', month: 'short' })
  }
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Views Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Просмотры по дням</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-end gap-1">
            {dailyStats.map((stat, idx) => {
              const height = Math.max((stat.views_count / maxViews) * 100, 2)
              return (
                <div 
                  key={stat.date}
                  className="flex-1 flex flex-col items-center group"
                >
                  <div className="relative w-full">
                    <div 
                      className="w-full bg-blue-500 rounded-t hover:bg-blue-600 transition-colors cursor-pointer"
                      style={{ height: `${height * 1.8}px` }}
                      title={`${formatDate(stat.date)}: ${stat.views_count.toLocaleString()} просмотров`}
                    />
                  </div>
                  {idx % Math.ceil(dailyStats.length / 7) === 0 && (
                    <span className="text-[10px] text-neutral-400 mt-1 -rotate-45 origin-top-left">
                      {formatDate(stat.date)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
      
      {/* Engagement Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Вовлечённость по дням</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-end gap-1">
            {dailyStats.map((stat, idx) => {
              const reactions = stat.reactions_count || 0
              const comments = stat.comments_count || 0
              const total = reactions + comments
              const height = Math.max((total / maxEngagement) * 100, 2)
              const reactionsRatio = total > 0 ? (reactions / total) * 100 : 50
              
              return (
                <div 
                  key={stat.date}
                  className="flex-1 flex flex-col items-center group"
                >
                  <div className="relative w-full flex flex-col">
                    <div 
                      className="w-full rounded-t overflow-hidden cursor-pointer"
                      style={{ height: `${height * 1.8}px` }}
                      title={`${formatDate(stat.date)}: ${reactions} реакций, ${comments} комментариев`}
                    >
                      <div 
                        className="w-full bg-pink-500 hover:bg-pink-600 transition-colors"
                        style={{ height: `${reactionsRatio}%` }}
                      />
                      <div 
                        className="w-full bg-purple-500 hover:bg-purple-600 transition-colors"
                        style={{ height: `${100 - reactionsRatio}%` }}
                      />
                    </div>
                  </div>
                  {idx % Math.ceil(dailyStats.length / 7) === 0 && (
                    <span className="text-[10px] text-neutral-400 mt-1 -rotate-45 origin-top-left">
                      {formatDate(stat.date)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex items-center justify-center gap-6 mt-4 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-pink-500 rounded" />
              <span className="text-neutral-600">Реакции</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-purple-500 rounded" />
              <span className="text-neutral-600">Комментарии</span>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Posts Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Публикации по дням</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-32 flex items-end gap-1">
            {dailyStats.map((stat, idx) => {
              const maxPosts = Math.max(...dailyStats.map(s => s.posts_count || 0), 1)
              const height = Math.max(((stat.posts_count || 0) / maxPosts) * 100, stat.posts_count ? 10 : 2)
              return (
                <div 
                  key={stat.date}
                  className="flex-1 flex flex-col items-center"
                >
                  <div 
                    className="w-full bg-amber-500 rounded-t hover:bg-amber-600 transition-colors cursor-pointer"
                    style={{ height: `${height * 1.2}px` }}
                    title={`${formatDate(stat.date)}: ${stat.posts_count || 0} постов`}
                  />
                  {idx % Math.ceil(dailyStats.length / 7) === 0 && (
                    <span className="text-[10px] text-neutral-400 mt-1 -rotate-45 origin-top-left">
                      {formatDate(stat.date)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
      
      {/* Subscribers Growth Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Динамика подписчиков</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-32 flex items-end gap-1">
            {dailyStats.map((stat, idx) => {
              const minSubs = Math.min(...dailyStats.map(s => s.subscriber_count || 0))
              const maxSubs = Math.max(...dailyStats.map(s => s.subscriber_count || 0), 1)
              const range = maxSubs - minSubs || 1
              const normalized = ((stat.subscriber_count || 0) - minSubs) / range
              const height = Math.max(normalized * 100, 5)
              
              return (
                <div 
                  key={stat.date}
                  className="flex-1 flex flex-col items-center"
                >
                  <div 
                    className="w-full bg-green-500 rounded-t hover:bg-green-600 transition-colors cursor-pointer"
                    style={{ height: `${height * 1.2}px` }}
                    title={`${formatDate(stat.date)}: ${(stat.subscriber_count || 0).toLocaleString()} подписчиков`}
                  />
                  {idx % Math.ceil(dailyStats.length / 7) === 0 && (
                    <span className="text-[10px] text-neutral-400 mt-1 -rotate-45 origin-top-left">
                      {formatDate(stat.date)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
