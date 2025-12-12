import { Metadata } from 'next'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { getEventOGImage, getAbsoluteOGImageUrl } from '@/lib/utils/ogImageFallback'
import TelegramAuthClient from './telegram-auth-client'

/**
 * Generate dynamic metadata for Telegram auth page based on redirect parameter
 * If redirecting to an event, use event's OG image for better Telegram previews
 * 
 * Priority:
 * 1. Event cover image (if redirect points to event)
 * 2. Organization logo
 * 3. Nothing (no Orbo default)
 */
export async function generateMetadata({ 
  searchParams 
}: { 
  searchParams: Promise<{ code?: string; redirect?: string }>
}): Promise<Metadata> {
  const { redirect } = await searchParams
  const adminSupabase = createAdminServer()
  
  // Default metadata
  let title = 'Авторизация через Telegram'
  let description = 'Подтвердите вход через Telegram для продолжения'
  let ogImage: string | null = null
  let siteName = 'Orbo'
  
  try {
    // Try to extract event and org info from redirect URL
    if (redirect) {
      // Extract org ID from redirect URL
      const orgMatch = redirect.match(/\/p\/([a-f0-9-]+)/i) || redirect.match(/\/app\/([a-f0-9-]+)/i)
      const eventMatch = redirect.match(/\/events\/([a-f0-9-]+)/i)
      
      let org: any = null
      let event: any = null
      
      // Fetch organization if found
      if (orgMatch) {
        const orgId = orgMatch[1]
        const { data: orgData } = await adminSupabase
          .from('organizations')
          .select('id, name, logo_url')
          .eq('id', orgId)
          .single()
        
        if (orgData) {
          org = orgData
          siteName = org.name
        }
      }
      
      // Fetch event if redirect points to event page
      if (eventMatch) {
        const eventId = eventMatch[1]
        
        const { data: eventData } = await adminSupabase
          .from('events')
          .select('id, title, description, cover_image_url, org_id')
          .eq('id', eventId)
          .single()
        
        if (eventData) {
          event = eventData
          
          // Use event metadata
          title = event.title
          
          if (event.description) {
            description = event.description.length > 200 
              ? event.description.substring(0, 197) + '...'
              : event.description
          }
          
          // If we don't have org yet, try to get it from event
          if (!org && event.org_id) {
            const { data: orgData } = await adminSupabase
              .from('organizations')
              .select('id, name, logo_url')
              .eq('id', event.org_id)
              .single()
            
            if (orgData) {
              org = orgData
              siteName = org.name
            }
          }
          
          // Get OG image (event cover → org logo → null)
          ogImage = getEventOGImage(event.cover_image_url, org?.logo_url)
        }
      }
      
      // If no event-specific image but have org logo
      if (!ogImage && org?.logo_url) {
        ogImage = org.logo_url
        title = `Войти | ${org.name}`
      }
      
      // Update title with site name if event exists
      if (event && siteName !== 'Orbo') {
        title = `${event.title} | ${siteName}`
      }
    }
    
    // Ensure absolute URL for OG image
    let absoluteOgImage: string | null = null
    if (ogImage) {
      if (ogImage.startsWith('http://') || ogImage.startsWith('https://')) {
        absoluteOgImage = ogImage
      } else {
        absoluteOgImage = getAbsoluteOGImageUrl(ogImage)
      }
    }
    
    // Build openGraph config
    const openGraphConfig: any = {
      type: 'website',
      locale: 'ru_RU',
      title,
      description,
      siteName,
    }
    
    if (absoluteOgImage) {
      openGraphConfig.images = [
        {
          url: absoluteOgImage,
          width: 1200,
          height: 630,
          alt: title,
        },
      ]
    }
    
    // Build twitter config
    const twitterConfig: any = {
      card: absoluteOgImage ? 'summary_large_image' : 'summary',
      title,
      description,
    }
    
    if (absoluteOgImage) {
      twitterConfig.images = [absoluteOgImage]
    }
    
    return {
      title,
      description,
      openGraph: openGraphConfig,
      twitter: twitterConfig,
    }
  } catch (error) {
    console.error('Error generating telegram auth page metadata:', error)
    return {
      title,
      description,
    }
  }
}

export default async function TelegramAuthPage({
  searchParams
}: {
  searchParams: Promise<{ code?: string; redirect?: string }>
}) {
  const params = await searchParams
  const code = params.code || ''
  const redirect = params.redirect || '/orgs'
  
  return <TelegramAuthClient code={code} redirectUrl={redirect} />
}

