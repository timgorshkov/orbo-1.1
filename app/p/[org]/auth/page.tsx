import { Metadata } from 'next'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { getEventOGImage, getAbsoluteOGImageUrl } from '@/lib/utils/ogImageFallback'
import MemberAuthClient from './auth-client'

/**
 * Generate dynamic metadata for auth page based on redirect parameter
 * If redirecting to an event, use event's OG image for better Telegram previews
 */
export async function generateMetadata({ 
  params,
  searchParams 
}: { 
  params: Promise<{ org: string }>
  searchParams: Promise<{ redirect?: string }>
}): Promise<Metadata> {
  const { org: orgId } = await params
  const { redirect } = await searchParams
  const adminSupabase = createAdminServer()
  
  // Default metadata
  let title = 'Войти как участник'
  let description = 'Используйте Telegram для быстрой авторизации'
  let ogImage: string | null = null
  let siteName = 'Orbo'
  
  try {
    // Fetch organization info
    const { data: org } = await adminSupabase
      .from('organizations')
      .select('id, name, logo_url')
      .eq('id', orgId)
      .single()
    
    if (org) {
      siteName = org.name
      title = `Войти | ${org.name}`
    }
    
    // Check if redirect points to an event
    if (redirect) {
      const eventMatch = redirect.match(/\/p\/[^/]+\/events\/([a-f0-9-]+)/i)
      
      if (eventMatch) {
        const eventId = eventMatch[1]
        
        // Fetch event data
        const { data: event } = await adminSupabase
          .from('events')
          .select('id, title, description, cover_image_url')
          .eq('id', eventId)
          .single()
        
        if (event) {
          // Use event metadata
          title = `${event.title} | ${siteName}`
          
          if (event.description) {
            description = event.description.length > 200 
              ? event.description.substring(0, 197) + '...'
              : event.description
          }
          
          // Get OG image (event cover → org logo → null)
          ogImage = getEventOGImage(event.cover_image_url, org?.logo_url)
        }
      }
    }
    
    // If no event-specific image, try org logo
    if (!ogImage && org?.logo_url) {
      ogImage = org.logo_url
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
    console.error('Error generating auth page metadata:', error)
    return {
      title,
      description,
    }
  }
}

export default async function MemberAuthPage({
  params,
  searchParams
}: {
  params: Promise<{ org: string }>
  searchParams: Promise<{ redirect?: string }>
}) {
  const { org: orgId } = await params
  const { redirect } = await searchParams
  const redirectUrl = redirect || `/p/${orgId}`
  
  return <MemberAuthClient orgId={orgId} redirectUrl={redirectUrl} />
}

