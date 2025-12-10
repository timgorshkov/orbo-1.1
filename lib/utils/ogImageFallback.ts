/**
 * Cascading OG Image Selection Logic
 * 
 * Provides fallback chain for Open Graph images in Telegram/social sharing:
 * 1. Event: event cover → org logo → null (no default Orbo branding)
 * 2. App Item: item image → app logo → org logo → null
 */

const ORBO_DEFAULT_OG_IMAGE = '/og-default.png' // 1200x630 for OG spec (not used for events)
const ORBO_LOGO_FALLBACK = '/orbo-logo-2-no-bg.png' // Existing logo (not used for events)

/**
 * Get OG image for an event
 * 
 * Priority:
 * 1. event.cover_image_url
 * 2. organization.logo_url (if exists)
 * 3. null (no fallback to Orbo logo - let Telegram handle default)
 */
export function getEventOGImage(
  eventCoverUrl: string | null | undefined,
  orgLogoUrl: string | null | undefined
): string | null {
  if (eventCoverUrl) {
    return eventCoverUrl
  }
  
  if (orgLogoUrl) {
    return orgLogoUrl
  }
  
  return null
}

/**
 * Get OG image for an app item
 * 
 * Priority:
 * 1. item.images[0] (first image from item data)
 * 2. app.logo_url (app custom logo/icon)
 * 3. organization.logo_url
 * 4. Orbo default logo
 */
export function getAppItemOGImage(
  itemImages: string[] | null | undefined,
  appLogoUrl: string | null | undefined,
  orgLogoUrl: string | null | undefined
): string {
  // Priority 1: Item's first image
  if (itemImages && itemImages.length > 0) {
    return itemImages[0]
  }
  
  // Priority 2: App custom logo
  if (appLogoUrl) {
    return appLogoUrl
  }
  
  // Priority 3: Organization logo
  if (orgLogoUrl) {
    return orgLogoUrl
  }
  
  // Priority 4: Orbo default
  return ORBO_LOGO_FALLBACK
}

/**
 * Get absolute URL for OG image (required by OG spec)
 * Handles both relative and absolute URLs
 */
export function getAbsoluteOGImageUrl(imageUrl: string, baseUrl?: string): string {
  // If already absolute URL
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl
  }
  
  // If relative URL, prepend base URL
  const base = baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://app.orbo.ru'
  
  // Ensure no double slashes
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base
  const cleanPath = imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`
  
  return `${cleanBase}${cleanPath}`
}

/**
 * Helper to extract image URL from item data
 * Handles different schema structures
 */
export function extractItemImageUrl(itemData: Record<string, any>): string | null {
  // Try common field names
  const possibleFields = ['image', 'images', 'photo', 'photos', 'cover', 'thumbnail']
  
  for (const field of possibleFields) {
    const value = itemData[field]
    
    if (!value) continue
    
    // If it's an array, get first item
    if (Array.isArray(value) && value.length > 0) {
      return typeof value[0] === 'string' ? value[0] : null
    }
    
    // If it's a string URL
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }
  
  return null
}

