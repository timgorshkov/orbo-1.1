import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createStorage, BUCKET_MATERIALS, getBucket, getStoragePath } from '@/lib/storage'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import sharp from 'sharp'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_COVER_WIDTH = 1200

// POST /api/organizations/[id]/cover - Upload portal cover image
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/organizations/[id]/cover' })
  let orgId: string | undefined
  try {
    const paramsData = await params
    orgId = paramsData.id
    const adminSupabase = createAdminServer()

    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Only owners and admins can upload cover' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Only JPG, PNG and WebP files are allowed' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File size must be less than 10MB' }, { status: 400 })
    }

    const storage = createStorage()
    const bucket = getBucket(BUCKET_MATERIALS)

    // Delete old cover if exists
    const { data: org } = await adminSupabase
      .from('organizations')
      .select('portal_cover_url')
      .eq('id', orgId)
      .single()

    if (org?.portal_cover_url) {
      const oldPath = org.portal_cover_url.split('/').slice(-2).join('/')
      if (oldPath) {
        const fullOldPath = getStoragePath(BUCKET_MATERIALS, oldPath)
        await storage.delete(bucket, fullOldPath)
      }
    }

    const arrayBuffer = await file.arrayBuffer()
    const inputBuffer = Buffer.from(arrayBuffer)

    let resizedBuffer: Buffer
    let outputContentType = 'image/jpeg'
    let outputExt = 'jpg'

    try {
      const image = sharp(inputBuffer)
      const metadata = await image.metadata()

      if (metadata.width && metadata.width > MAX_COVER_WIDTH) {
        resizedBuffer = await image
          .resize(MAX_COVER_WIDTH, null, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer()
      } else {
        resizedBuffer = await image.jpeg({ quality: 85 }).toBuffer()
      }
    } catch (sharpError) {
      logger.error({ error: sharpError instanceof Error ? sharpError.message : String(sharpError), org_id: orgId }, 'Image processing error')
      resizedBuffer = inputBuffer
      outputContentType = file.type
      outputExt = file.name.split('.').pop() || 'jpg'
    }

    const logicalPath = `org-covers/${orgId}.${outputExt}`
    const storagePath = getStoragePath(BUCKET_MATERIALS, logicalPath)

    const { error: uploadError } = await storage.upload(bucket, storagePath, resizedBuffer, {
      contentType: outputContentType,
      upsert: true,
    })

    if (uploadError) {
      logger.error({ error: uploadError.message, org_id: orgId, path: storagePath }, 'Upload error')
      return NextResponse.json({ error: 'Failed to upload file: ' + uploadError.message }, { status: 500 })
    }

    const basePublicUrl = storage.getPublicUrl(bucket, storagePath)
    const publicUrl = `${basePublicUrl}?v=${Date.now()}`

    const { data: updatedOrg, error: updateError } = await adminSupabase
      .from('organizations')
      .update({ portal_cover_url: publicUrl })
      .eq('id', orgId)
      .select()
      .single()

    if (updateError) {
      logger.error({ error: updateError.message, org_id: orgId }, 'Update error')
      return NextResponse.json({ error: 'Failed to update organization' }, { status: 500 })
    }

    logger.info({ org_id: orgId, cover_url: publicUrl }, 'Cover uploaded successfully')
    return NextResponse.json({ success: true, cover_url: publicUrl, organization: updatedOrg })
  } catch (error: any) {
    logger.error({ error: error.message, stack: error.stack, org_id: orgId }, 'Error in POST /api/organizations/[id]/cover')
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/organizations/[id]/cover - Remove portal cover image
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, { endpoint: '/api/organizations/[id]/cover' })
  try {
    const { id: orgId } = await params
    const adminSupabase = createAdminServer()

    const user = await getUnifiedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: membership } = await adminSupabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Only owners and admins can delete cover' }, { status: 403 })
    }

    const { data: org } = await adminSupabase
      .from('organizations')
      .select('portal_cover_url')
      .eq('id', orgId)
      .single()

    if (!org?.portal_cover_url) {
      return NextResponse.json({ error: 'No cover to delete' }, { status: 404 })
    }

    const storage = createStorage()
    const bucket = getBucket(BUCKET_MATERIALS)

    const oldPath = org.portal_cover_url.split('/').slice(-2).join('/')
    if (oldPath) {
      const fullPath = getStoragePath(BUCKET_MATERIALS, oldPath)
      await storage.delete(bucket, fullPath)
    }

    const { data: updatedOrg, error: updateError } = await adminSupabase
      .from('organizations')
      .update({ portal_cover_url: null })
      .eq('id', orgId)
      .select()
      .single()

    if (updateError) {
      logger.error({ error: updateError.message, org_id: orgId }, 'Update error')
      return NextResponse.json({ error: 'Failed to update organization' }, { status: 500 })
    }

    logger.info({ org_id: orgId }, 'Cover deleted successfully')
    return NextResponse.json({ success: true, organization: updatedOrg })
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error in DELETE /api/organizations/[id]/cover')
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
