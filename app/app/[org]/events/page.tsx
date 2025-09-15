import AppShell from '@/components/app-shell'
import { requireOrgAccess } from '@/lib/orgGuard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { notFound } from 'next/navigation'
import Link from 'next/link'

type Event = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  visibility: 'public' | 'members';
  created_at: string;
};

export default async function EventsPage({ params }: { params: { org: string } }) {
  try {
    const { supabase } = await requireOrgAccess(params.org)
    
    // Получаем список событий организации
    const { data: events, error } = await supabase
      .from('events')
      .select('*')
      .eq('org_id', params.org)
      .order('starts_at', { ascending: true })
      .limit(50) as { data: Event[] | null, error: any }
    
    if (error) {
      console.error('Error fetching events:', error)
    }
    
    // Разделяем события на предстоящие и прошедшие
    const now = new Date()
    const upcomingEvents = events?.filter(e => new Date(e.starts_at) >= now) || []
    const pastEvents = events?.filter(e => new Date(e.starts_at) < now) || []
    
    // Получаем список групп
    const { data: telegramGroups } = await supabase
      .from('telegram_groups')
      .select('id, title, tg_chat_id')
      .eq('org_id', params.org)
      .order('title')


    return (
      <AppShell orgId={params.org} currentPath={`/app/${params.org}/events`} telegramGroups={telegramGroups || []}>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">События</h1>
          <div>
            <Link href={`/app/${params.org}/events/new`}>
              <Button>+ Создать</Button>
            </Link>
          </div>
        </div>
        
        {/* Предстоящие события */}
        <div className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Предстоящие</h2>
          
          {upcomingEvents.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {upcomingEvents.map(event => (
                <EventCard key={event.id} event={event} orgId={params.org} />
              ))}
            </div>
          ) : (
            <Card className="bg-neutral-50 border-dashed">
              <CardContent className="py-12 text-center">
                <p className="text-neutral-500">Нет предстоящих событий</p>
                <div className="mt-4">
                  <Link href={`/app/${params.org}/events/new`}>
                    <Button>Создать событие</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        
        {/* Прошедшие события */}
        {pastEvents.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Прошедшие</h2>
            
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pastEvents.map(event => (
                <EventCard 
                  key={event.id} 
                  event={event} 
                  orgId={params.org} 
                  isPast={true} 
                />
              ))}
            </div>
          </div>
        )}
      </AppShell>
    )
  } catch (error) {
    console.error('Events page error:', error)
    return notFound()
  }
}

function EventCard({ 
  event, 
  orgId, 
  isPast = false 
}: { 
  event: Event; 
  orgId: string; 
  isPast?: boolean 
}) {
  // Форматирование даты для отображения
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('ru', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
  
  return (
    <Card className={isPast ? 'opacity-70' : ''}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-base">
            <Link href={`/app/${orgId}/events/${event.id}`} className="hover:underline">
              {event.title}
            </Link>
          </CardTitle>
          <div className="text-xs rounded-full px-2 py-1 bg-black/5 text-neutral-600">
            {event.visibility === 'public' ? 'Публичное' : 'Только для участников'}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-neutral-500 mb-4">
          {formatDate(event.starts_at)}
          {event.ends_at && (
            <>
              <br />
              <span className="text-neutral-400">до {formatDate(event.ends_at)}</span>
            </>
          )}
        </div>
        
        {event.description && (
          <p className="text-sm line-clamp-2 text-neutral-600 mb-4">
            {event.description}
          </p>
        )}
        
        <div className="flex justify-between items-center">
          <Button variant="outline" asChild>
            <Link href={`/app/${orgId}/events/${event.id}`}>
              Детали
            </Link>
          </Button>
          
          {!isPast && (
            <Button variant="ghost" className="text-xs">
              QR код
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
