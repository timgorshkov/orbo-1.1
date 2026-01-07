import { redirect } from 'next/navigation'

/**
 * Редирект со старой структуры /app/[org]/events/[id] на новую /p/[org]/events/[id]
 */
export default async function OldEventDetailPageRedirect({ 
  params,
  searchParams 
}: { 
  params: Promise<{ org: string; id: string }>
  searchParams: Promise<{ edit?: string }>
}) {
  const { org, id } = await params
  const { edit } = await searchParams
  
  const editParam = edit === 'true' ? '?edit=true' : ''
  redirect(`/p/${org}/events/${id}${editParam}`)
}
