import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { createStorage, getBucket, getStoragePath } from '@/lib/storage'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const BUCKET_NAME = 'event-covers'

// POST /api/events/[id]/cover - Upload event cover image
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/events/[id]/cover' });
  try {
    const { id: eventId } = await params

    // Check authentication via unified auth
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminServer()

    // Get event to check org_id
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('org_id, cover_image_url')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Check user is owner or admin
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', event.org_id)
      .eq('user_id', user.id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only owners and admins can upload event covers' },
        { status: 403 }
      )
    }

    // Parse form data
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Validate file
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Only JPEG, PNG, WebP and GIF files are allowed' },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size must be less than 5MB' },
        { status: 400 }
      )
    }

    // Initialize storage provider (Selectel S3 or other)
    const storage = createStorage()
    const bucket = getBucket(BUCKET_NAME)

    // Delete old cover if exists
    if (event.cover_image_url && !event.cover_image_url.startsWith('blob:')) {
      try {
        // Try to extract path from old URL and delete
        const oldFileName = event.cover_image_url.split('/').pop()?.split('?')[0]
        if (oldFileName) {
          const oldPath = getStoragePath(BUCKET_NAME, `${event.org_id}/${oldFileName}`)
          await storage.delete(bucket, oldPath)
          logger.info({ old_path: oldPath }, 'Deleted old cover image')
        }
      } catch (deleteErr) {
        // Log but don't fail - old file might not exist
        logger.warn({ error: deleteErr }, 'Failed to delete old cover, continuing')
      }
    }

    // Get file extension
    const ext = file.name.split('.').pop() || 'jpg'
    const fileName = `${eventId}-${Date.now()}.${ext}`
    const filePath = getStoragePath(BUCKET_NAME, `${event.org_id}/${fileName}`)

    // Upload new file
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { data: uploadData, error: uploadError } = await storage.upload(
      bucket,
      filePath,
      buffer,
      {
        contentType: file.type,
        cacheControl: 'public, max-age=31536000', // 1 year cache
      }
    )

    if (uploadError) {
      logger.error({ error: uploadError.message, event_id: eventId }, 'Upload error');
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      )
    }

    // Get public URL
    const publicUrl = storage.getPublicUrl(bucket, filePath)
    logger.info({ event_id: eventId, url: publicUrl }, 'Cover uploaded successfully')

    // Update event
    const { data: updatedEvent, error: updateError } = await supabase
      .from('events')
      .update({ cover_image_url: publicUrl })
      .eq('id', eventId)
      .select()
      .single()

    if (updateError) {
      logger.error({ error: updateError.message, event_id: eventId }, 'Update error');
      return NextResponse.json(
        { error: 'Failed to update event' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      cover_image_url: publicUrl,
      event: updatedEvent
    })
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Error in POST /api/events/[id]/cover');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/events/[id]/cover - Remove event cover image
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/events/[id]/cover' });
  try {
    const { id: eventId } = await params

    // Check authentication via unified auth
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminServer()

    // Get event to check org_id
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('org_id, cover_image_url')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Check user is owner or admin
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', event.org_id)
      .eq('user_id', user.id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only owners and admins can delete event covers' },
        { status: 403 }
      )
    }

    if (!event.cover_image_url) {
      return NextResponse.json(
        { error: 'No cover image to delete' },
        { status: 404 }
      )
    }

    // Initialize storage provider
    const storage = createStorage()
    const bucket = getBucket(BUCKET_NAME)

    // Delete from storage (skip blob: URLs which are invalid)
    if (!event.cover_image_url.startsWith('blob:')) {
      try {
        const oldFileName = event.cover_image_url.split('/').pop()?.split('?')[0]
        if (oldFileName) {
          const oldPath = getStoragePath(BUCKET_NAME, `${event.org_id}/${oldFileName}`)
          await storage.delete(bucket, oldPath)
          logger.info({ path: oldPath }, 'Deleted cover image from storage')
        }
      } catch (deleteErr) {
        logger.warn({ error: deleteErr }, 'Failed to delete from storage, continuing')
      }
    }

    // Update event
    const { data: updatedEvent, error: updateError } = await supabase
      .from('events')
      .update({ cover_image_url: null })
      .eq('id', eventId)
      .select()
      .single()

    if (updateError) {
      logger.error({ error: updateError.message, event_id: eventId }, 'Update error');
      return NextResponse.json(
        { error: 'Failed to update event' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      event: updatedEvent
    })
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Error in DELETE /api/events/[id]/cover');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
