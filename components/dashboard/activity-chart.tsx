'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface ActivityDataPoint {
  date: string
  messages: number
}

interface ActivityChartProps {
  data: ActivityDataPoint[]
  totalParticipants: number
}

export default function ActivityChart({ data, totalParticipants }: ActivityChartProps) {
  const maxMessages = Math.max(...data.map(d => d.messages), 1)
  const chartMaxHeight = Math.ceil(maxMessages * 1.5) // 1.5x от максимума для верха шкалы
  const totalMessages = data.reduce((sum, d) => sum + d.messages, 0)
  const avgMessages = Math.round(totalMessages / data.length)

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short' }).format(date)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Активность за 14 дней</CardTitle>
        <div className="flex gap-6 mt-2">
          <div>
            <div className="text-sm text-neutral-500">Всего участников</div>
            <div className="text-2xl font-bold">{totalParticipants}</div>
          </div>
          <div>
            <div className="text-sm text-neutral-500">Сообщений за период</div>
            <div className="text-2xl font-bold">{totalMessages}</div>
          </div>
          <div>
            <div className="text-sm text-neutral-500">В среднем за день</div>
            <div className="text-2xl font-bold">{avgMessages}</div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {totalMessages === 0 ? (
          <div className="text-center py-8 text-neutral-500">
            <p>Нет данных об активности</p>
            <p className="text-sm mt-1">Добавьте Telegram-группы для отслеживания активности</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Chart with zero baseline */}
            <div className="relative h-48 border-b border-neutral-200">
              <div className="absolute inset-0 flex items-end gap-1 pb-8">
                {data.map((point, index) => (
                  <div key={point.date} className="flex-1 flex flex-col items-center justify-end h-full">
                    <div className="relative w-full group h-full flex items-end justify-center">
                      <div 
                        className="w-full max-w-[80%] bg-gradient-to-t from-blue-500 to-blue-300 rounded-t transition-all hover:from-blue-600 hover:to-blue-400 cursor-pointer"
                        style={{ 
                          height: `${chartMaxHeight > 0 ? (point.messages / chartMaxHeight) * 100 : 0}%`,
                          minHeight: point.messages > 0 ? '4px' : '0'
                        }}
                        title={`${formatDate(point.date)}: ${point.messages} сообщений`}
                      />
                      {/* Tooltip on hover */}
                      <div className="absolute bottom-full mb-2 hidden group-hover:block bg-neutral-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                        {point.messages} {point.messages === 1 ? 'сообщение' : 'сообщений'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Date labels */}
            <div className="flex gap-1">
              {data.map((point, index) => (
                <div key={point.date} className="flex-1 text-center">
                  {index % 2 === 0 && (
                    <div className="text-xs text-neutral-400">
                      {formatDate(point.date)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

