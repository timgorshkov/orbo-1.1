import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { createStorage, getBucket, getStoragePath } from '@/lib/storage'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const BUCKET_NAME = 'form-covers'

// POST /api/applications/forms/[formId]/cover - Upload form cover image
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ formId: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/applications/forms/[id]/cover' });
  try {
    const { formId } = await params

    // Check authentication
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminServer()

    // Get form to check org_id
    const { data: form, error: formError } = await supabase
      .from('application_forms')
      .select('org_id, landing')
      .eq('id', formId)
      .single()

    if (formError || !form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 })
    }

    // Check user is owner or admin
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', form.org_id)
      .eq('user_id', user.id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only owners and admins can upload form covers' },
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

    // Delete old cover if exists
    const oldCoverUrl = form.landing?.cover_image_url
    if (oldCoverUrl && !oldCoverUrl.startsWith('http://') && !oldCoverUrl.startsWith('https://external')) {
      try {
        const oldFileName = oldCoverUrl.split('/').pop()?.split('?')[0]
        if (oldFileName) {
          const oldPath = getStoragePath(BUCKET_NAME, `${form.org_id}/${oldFileName}`)
          await storage.delete(bucket, oldPath)
          logger.info({ old_path: oldPath }, 'Deleted old form cover')
        }
      } catch (deleteErr) {
        logger.warn({ error: deleteErr }, 'Failed to delete old cover, continuing')
      }
    }

    // Get file extension
    const ext = file.name.split('.').pop() || 'jpg'
    const fileName = `${formId}-${Date.now()}.${ext}`
    const filePath = getStoragePath(BUCKET_NAME, `${form.org_id}/${fileName}`)

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
      logger.error({ error: uploadError.message, form_id: formId }, 'Upload error');
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      )
    }

    // Get public URL with cache-busting
    const baseUrl = storage.getPublicUrl(bucket, filePath)
    const publicUrl = `${baseUrl}?v=${Date.now()}`
    logger.info({ form_id: formId, url: publicUrl }, 'Form cover uploaded successfully')

    // Update form's landing.cover_image_url
    const updatedLanding = {
      ...(form.landing || {}),
      cover_image_url: publicUrl
    }

    const { error: updateError } = await supabase
      .from('application_forms')
      .update({ landing: updatedLanding })
      .eq('id', formId)

    if (updateError) {
      logger.error({ error: updateError.message, form_id: formId }, 'Update error');
      return NextResponse.json(
        { error: 'Failed to update form' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      cover_image_url: publicUrl
    })
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack
    }, 'Error uploading form cover');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
