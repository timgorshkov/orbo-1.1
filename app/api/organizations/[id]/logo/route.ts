import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createStorage, BUCKET_MATERIALS, getBucket, getStoragePath } from '@/lib/storage'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import sharp from 'sharp'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_LOGO_WIDTH = 400 // Max width in pixels for resized logo

// POST /api/organizations/[id]/logo - Upload organization logo
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/organizations/[id]/logo' });
  let orgId: string | undefined;
  try {
    const paramsData = await params;
    orgId = paramsData.id;
    const adminSupabase = createAdminServer()

    // Check authentication via unified auth
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check user is owner or admin
    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only owners and admins can upload logo' },
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
        { error: 'Only JPG, PNG and WebP files are allowed' },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size must be less than 5MB' },
        { status: 400 }
      )
    }

    // Create storage provider
    const storage = createStorage()
    const bucket = getBucket(BUCKET_MATERIALS)

    // Delete old logo if exists
    const { data: org } = await adminSupabase
      .from('organizations')
      .select('logo_url')
      .eq('id', orgId)
      .single()

    if (org?.logo_url) {
      // Extract path from URL (handle both Supabase and S3 URLs)
      const oldPath = org.logo_url.split('/').slice(-2).join('/')
      if (oldPath) {
        const fullOldPath = getStoragePath(BUCKET_MATERIALS, oldPath)
        logger.info({ old_path: fullOldPath, bucket }, 'Deleting old logo')
        await storage.delete(bucket, fullOldPath)
      }
    }

    // Upload new file with resizing
    const arrayBuffer = await file.arrayBuffer()
    const inputBuffer = Buffer.from(arrayBuffer)
    
    // Resize image to max width while maintaining aspect ratio
    // Convert to JPEG for consistent output and smaller file size
    let resizedBuffer: Buffer
    let outputContentType = 'image/jpeg'
    let outputExt = 'jpg'
    
    try {
      const image = sharp(inputBuffer)
      const metadata = await image.metadata()
      
      // Only resize if image is wider than MAX_LOGO_WIDTH
      if (metadata.width && metadata.width > MAX_LOGO_WIDTH) {
        resizedBuffer = await image
          .resize(MAX_LOGO_WIDTH, null, { 
            fit: 'inside',
            withoutEnlargement: true 
          })
          .jpeg({ quality: 85 })
          .toBuffer()
      } else {
        // Keep original size but convert to JPEG for consistency
        resizedBuffer = await image
          .jpeg({ quality: 85 })
          .toBuffer()
      }
    } catch (sharpError) {
      logger.error({ 
        error: sharpError instanceof Error ? sharpError.message : String(sharpError),
        org_id: orgId
      }, 'Image processing error');
      // Fallback to original buffer if processing fails
      resizedBuffer = inputBuffer
      outputContentType = file.type
      outputExt = file.name.split('.').pop() || 'jpg'
    }
    
    // Path within the logical bucket
    const logicalPath = `org-logos/${orgId}.${outputExt}`
    // Full path for S3 (includes logical bucket as prefix)
    const storagePath = getStoragePath(BUCKET_MATERIALS, logicalPath)

    logger.info({ 
      bucket, 
      storage_path: storagePath,
      logical_path: logicalPath,
      size: resizedBuffer.length 
    }, 'Uploading logo')

    // Upload via storage abstraction
    const { error: uploadError } = await storage.upload(
      bucket, 
      storagePath, 
      resizedBuffer, 
      {
        contentType: outputContentType,
        upsert: true
      }
    )

    if (uploadError) {
      logger.error({ 
        error: uploadError.message,
        org_id: orgId,
        bucket,
        path: storagePath
      }, 'Upload error');
      return NextResponse.json(
        { error: 'Failed to upload file: ' + uploadError.message },
        { status: 500 }
      )
    }

    // Get public URL
    const publicUrl = storage.getPublicUrl(bucket, storagePath)
    
    logger.info({ 
      org_id: orgId, 
      logo_url: publicUrl,
      bucket,
      path: storagePath
    }, 'Logo uploaded successfully')

    // Update organization
    const { data: updatedOrg, error: updateError } = await adminSupabase
      .from('organizations')
      .update({ logo_url: publicUrl })
      .eq('id', orgId)
      .select()
      .single()

    if (updateError) {
      logger.error({ error: updateError.message, org_id: orgId }, 'Update error')
      return NextResponse.json(
        { error: 'Failed to update organization' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      logo_url: publicUrl,
      organization: updatedOrg
    })
  } catch (error: any) {
    logger.error({ 
      error: error.message, 
      stack: error.stack,
      org_id: orgId 
    }, 'Error in POST /api/organizations/[id]/logo')
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/organizations/[id]/logo - Remove organization logo
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/organizations/[id]/logo' });
  try {
    const { id: orgId } = await params
    const adminSupabase = createAdminServer()

    // Check authentication via unified auth
    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check user is owner or admin
    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only owners and admins can delete logo' },
        { status: 403 }
      )
    }

    // Get current logo
    const { data: org } = await adminSupabase
      .from('organizations')
      .select('logo_url')
      .eq('id', orgId)
      .single()

    if (!org?.logo_url) {
      return NextResponse.json(
        { error: 'No logo to delete' },
        { status: 404 }
      )
    }

    // Delete from storage
    const storage = createStorage()
    const bucket = getBucket(BUCKET_MATERIALS)

    // Extract path from URL
    const oldPath = org.logo_url.split('/').slice(-2).join('/')
    if (oldPath) {
      const fullPath = getStoragePath(BUCKET_MATERIALS, oldPath)
      logger.info({ path: fullPath, bucket }, 'Deleting logo')
      await storage.delete(bucket, fullPath)
    }

    // Update organization
    const { data: updatedOrg, error: updateError } = await adminSupabase
      .from('organizations')
      .update({ logo_url: null })
      .eq('id', orgId)
      .select()
      .single()

    if (updateError) {
      logger.error({ error: updateError.message, org_id: orgId }, 'Update error')
      return NextResponse.json(
        { error: 'Failed to update organization' },
        { status: 500 }
      )
    }

    logger.info({ org_id: orgId }, 'Logo deleted successfully')

    return NextResponse.json({
      success: true,
      organization: updatedOrg
    })
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error in DELETE /api/organizations/[id]/logo')
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
