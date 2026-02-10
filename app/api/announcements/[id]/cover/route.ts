import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { createStorage, getBucket, getStoragePath } from '@/lib/storage'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const BUCKET_NAME = 'announcement-images'

// POST /api/announcements/[id]/cover - Upload announcement image
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/announcements/[id]/cover' });
  try {
    const { id: announcementId } = await params

    // Check authentication
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminServer()

    // Get announcement to check org_id
    const { data: announcement, error: annError } = await supabase
      .from('announcements')
      .select('org_id, image_url')
      .eq('id', announcementId)
      .single()

    if (annError || !announcement) {
      return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })
    }

    // Check user is owner or admin
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', announcement.org_id)
      .eq('user_id', user.id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only owners and admins can upload images' },
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

    // Initialize storage
    const storage = createStorage()
    const bucket = getBucket(BUCKET_NAME)

    // Delete old image if exists
    if (announcement.image_url) {
      try {
        const oldFileName = announcement.image_url.split('/').pop()?.split('?')[0]
        if (oldFileName) {
          const oldPath = getStoragePath(BUCKET_NAME, `${announcement.org_id}/${oldFileName}`)
          await storage.delete(bucket, oldPath)
          logger.info({ old_path: oldPath }, 'Deleted old announcement image')
        }
      } catch (deleteErr) {
        logger.warn({ error: deleteErr }, 'Failed to delete old image, continuing')
      }
    }

    // Get file extension
    const ext = file.name.split('.').pop() || 'jpg'
    const fileName = `${announcementId}-${Date.now()}.${ext}`
    const filePath = getStoragePath(BUCKET_NAME, `${announcement.org_id}/${fileName}`)

    // Upload new file
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { data: uploadData, error: uploadError } = await storage.upload(
      bucket,
      filePath,
      buffer,
      {
        contentType: file.type,
        cacheControl: 'public, max-age=31536000',
      }
    )

    if (uploadError) {
      logger.error({ error: uploadError.message, announcement_id: announcementId }, 'Upload error');
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      )
    }

    // Get public URL
    const publicUrl = storage.getPublicUrl(bucket, filePath)
    logger.info({ announcement_id: announcementId, url: publicUrl }, 'Announcement image uploaded')

    // Update announcement
    const { error: updateError } = await supabase
      .from('announcements')
      .update({ image_url: publicUrl })
      .eq('id', announcementId)

    if (updateError) {
      logger.error({ error: updateError.message, announcement_id: announcementId }, 'Update error');
      return NextResponse.json(
        { error: 'Failed to update announcement' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      image_url: publicUrl
    })
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Error uploading announcement image');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/announcements/[id]/cover - Remove announcement image
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/announcements/[id]/cover' });
  try {
    const { id: announcementId } = await params

    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminServer()

    const { data: announcement } = await supabase
      .from('announcements')
      .select('org_id, image_url')
      .eq('id', announcementId)
      .single()

    if (!announcement) {
      return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })
    }

    // Check user is owner or admin
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', announcement.org_id)
      .eq('user_id', user.id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    if (announcement.image_url) {
      const storage = createStorage()
      const bucket = getBucket(BUCKET_NAME)
      try {
        const fileName = announcement.image_url.split('/').pop()?.split('?')[0]
        if (fileName) {
          const path = getStoragePath(BUCKET_NAME, `${announcement.org_id}/${fileName}`)
          await storage.delete(bucket, path)
        }
      } catch (deleteErr) {
        logger.warn({ error: deleteErr }, 'Failed to delete file from storage')
      }
    }

    await supabase
      .from('announcements')
      .update({ image_url: null })
      .eq('id', announcementId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error deleting announcement image');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
