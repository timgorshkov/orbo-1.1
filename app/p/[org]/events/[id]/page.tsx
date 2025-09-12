import { createClientServer } from '@/lib/supabaseClient'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { notFound } from 'next/navigation'

type Event = {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  visibility: 'public' | 'members';
  calendar_url: string | null;
};

export default async function PublicEvent({ 
  params, 
  searchParams 
}: { 
  params: { org: string, id: string }
  searchParams: Record<string, string>
}) {
  const supabase = createClientServer()
  
  // Получаем данные события
  const { data: event, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', params.id)
    .eq('org_id', params.org)
    .single() as { data: Event | null, error: any }
  
  if (error || !event) {
    return notFound()
  }
  
  // Проверяем, публичное ли событие
  if (event.visibility !== 'public') {
    // Для приватных событий тоже можно проверять авторизацию и членство,
    // но в MVP просто блокируем доступ
    return (
      <div className="max-w-3xl mx-auto p-6 mt-8">
        <h1 className="text-2xl font-semibold mb-4">Событие недоступно</h1>
        <p className="text-neutral-600">
          Это событие доступно только для участников сообщества.
        </p>
      </div>
    )
  }
  
  // Форматирование даты
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('ru', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
  
  // Проверяем статус чек-ина из URL параметра
  const checkinStatus = searchParams.checkin
  
  return (
    <div className="max-w-3xl mx-auto p-6 mt-8">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold mb-3">{event.title}</h1>
        
        <div className="flex flex-wrap gap-2 items-center text-sm text-neutral-500 mb-4">
          <div>
            📅 {formatDate(event.starts_at)}
            {event.ends_at && ` – ${formatDate(event.ends_at)}`}
          </div>
          
          <div className="bg-black/5 rounded-full px-3 py-1">Публичное</div>
        </div>
      </header>
      
      {/* Статус чек-ина */}
      {checkinStatus && (
        <Card className={`mb-6 ${checkinStatus === 'ok' ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
          <CardContent className="py-4">
            {checkinStatus === 'ok' && (
              <div className="text-green-800 font-medium">
                ✓ Вы успешно отметились на мероприятии
              </div>
            )}
            {checkinStatus === 'already' && (
              <div className="text-amber-800">
                ⓘ Вы уже отмечены на этом мероприятии
              </div>
            )}
          </CardContent>
        </Card>
      )}
      
      {/* Описание события */}
      {event.description && (
        <div className="prose max-w-none mb-8">
          <h2 className="text-xl font-semibold mb-4">О событии</h2>
          <div className="text-neutral-700 whitespace-pre-line">
            {event.description}
          </div>
        </div>
      )}
      
      {/* Действия */}
      <div className="flex flex-wrap gap-4 mt-6">
        {event.calendar_url && (
          <Button variant="outline" asChild>
            <Link href={event.calendar_url} target="_blank" rel="noopener">
              📅 Добавить в календарь
            </Link>
          </Button>
        )}
        
        <Button asChild>
          <Link href={`/p/${params.org}/events/${params.id}/register`}>
            Зарегистрироваться
          </Link>
        </Button>
      </div>
      
      {/* Футер с информацией об организаторе */}
      <footer className="mt-16 pt-6 border-t text-sm text-neutral-500">
        <p>Событие организовано в <Link href={`/p/${params.org}`} className="underline">Orbo</Link></p>
      </footer>
    </div>
  )
}
