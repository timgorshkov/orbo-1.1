import { redirect } from 'next/navigation'
import { Metadata } from 'next'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'
import { getAbsoluteOGImageUrl } from '@/lib/utils/ogImageFallback'
import AuthenticatedHome from '@/components/home/authenticated-home'
import PublicCommunityHub from '@/components/home/public-community-hub'
import { createServiceLogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

export const dynamic = 'force-dynamic'

/**
 * Generate OG metadata for organization page
 * Shows organization logo or nothing (no Orbo default)
 */
export async function generateMetadata({ 
  params 
}: { 
  params: Promise<{ org: string }>
}): Promise<Metadata> {
  const { org: orgId } = await params
  const adminSupabase = createAdminServer()
  
  // Default metadata
  let title = 'Сообщество'
  let description = 'Присоединяйтесь к нашему сообществу'
  let ogImage: string | null = null
  let orgName: string | null = null
  
  try {
    // Fetch organization info
    const { data: org, error } = await adminSupabase
      .from('organizations')
      .select('id, name, logo_url')
      .eq('id', orgId)
      .single()
    
    const logger = createServiceLogger('CommunityHubPage');
    if (error) {
      logger.error({
        error: error.message,
        error_code: error.code,
        org_id: orgId
      }, 'Error fetching org for OG metadata');
    }
    
    if (org) {
      orgName = org.name
      // Title is the organization name
      title = org.name
      description = `Сообщество ${org.name} — присоединяйтесь!`
      
      // Use org logo if available (no Orbo fallback)
      if (org.logo_url) {
        ogImage = org.logo_url
      }
    } else {
      logger.warn({ org_id: orgId }, 'Organization not found for OG metadata');
    }
  } catch (error) {
    const logger = createServiceLogger('CommunityHubPage');
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      org_id: orgId
    }, 'Exception generating OG metadata');
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
  // og:title = organization name (main title in Telegram preview)
  // og:site_name = "Orbo" (shown above title in smaller text)
  const openGraphConfig: any = {
    type: 'website',
    locale: 'ru_RU',
    title, // Organization name
    description,
    siteName: orgName || 'Orbo', // Show org name or Orbo as site name
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
    // Use absolute title to override root layout template (avoid "| Orbo" suffix for org pages)
    title: {
      absolute: title,
    },
    description,
    // Override root layout metadata - don't show Orbo branding on org pages
    authors: undefined,
    creator: undefined,
    publisher: undefined,
    keywords: undefined,
    openGraph: openGraphConfig,
    twitter: twitterConfig,
  }
}

export default async function CommunityHubPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params
  const supabase = await createClientServer()
  const adminSupabase = createAdminServer()

  // Check authentication via unified auth (supports both Supabase and NextAuth)
  const user = await getUnifiedUser()

  // If not authenticated, show public version
  if (!user) {
    return <PublicCommunityHub orgId={orgId} />
  }

  // Check if user has access to this organization (use admin client to bypass RLS)
  const { data: membership } = await adminSupabase
    .from('memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', orgId)
    .maybeSingle()

  // If no membership, redirect to auth page
  if (!membership) {
    redirect(`/p/${orgId}/auth`)
  }

  const isAdmin = membership.role === 'owner' || membership.role === 'admin'

  // Show authenticated version
  return <AuthenticatedHome orgId={orgId} isAdmin={isAdmin} />
}
