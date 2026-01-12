/**
 * Short Event URL Handler
 * Redirects /e/{eventId} to the full public event URL /p/{orgId}/events/{eventId}
 */

import { redirect, notFound } from 'next/navigation';
import { createAdminServer } from '@/lib/server/supabaseServer';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

export default async function EventShortUrlPage({ params }: PageProps) {
  const { id: eventId } = params;
  
  // Validate eventId format (UUID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(eventId)) {
    notFound();
  }
  
  const supabase = createAdminServer();
  
  // Look up the event to get org_id
  const { data: event, error } = await supabase
    .from('events')
    .select('id, org_id, status')
    .eq('id', eventId)
    .single();
  
  if (error || !event) {
    notFound();
  }
  
  // Only allow published or completed events to be viewed via short link
  if (!['published', 'completed'].includes(event.status)) {
    notFound();
  }
  
  // Redirect to the public event page
  redirect(`/p/${event.org_id}/events/${event.id}`);
}
