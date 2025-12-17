import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'
import { createClient } from '@supabase/supabase-js'
import { createAPILogger } from '@/lib/logger'
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
    const supabase = await createClientServer()

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check user is owner or admin
    const { data: membership } = await supabase
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

    // Create admin Supabase client for storage
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Delete old logo if exists
    const { data: org } = await supabase
      .from('organizations')
      .select('logo_url')
      .eq('id', orgId)
      .single()

    if (org?.logo_url) {
      const oldPath = org.logo_url.split('/').pop()
      if (oldPath) {
        await adminSupabase.storage
          .from('materials')
          .remove([`org-logos/${oldPath}`])
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
    
    // Update file path with new extension
    const resizedFilePath = `org-logos/${orgId}.${outputExt}`

    const { data: uploadData, error: uploadError } = await adminSupabase.storage
      .from('materials')
      .upload(resizedFilePath, resizedBuffer, {
        contentType: outputContentType,
        upsert: true
      })

    if (uploadError) {
      logger.error({ 
        error: uploadError.message,
        org_id: orgId
      }, 'Upload error');
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      )
    }

    // Get public URL
    const { data: { publicUrl } } = adminSupabase.storage
      .from('materials')
      .getPublicUrl(resizedFilePath)

    // Update organization
    const { data: updatedOrg, error: updateError } = await supabase
      .from('organizations')
      .update({ logo_url: publicUrl })
      .eq('id', orgId)
      .select()
      .single()

    if (updateError) {
      logger.error({ 
        error: updateError.message,
        org_id: orgId
      }, 'Update error');
      return NextResponse.json(
        { error: 'Failed to update organization' },
        { status: 500 }
      )
    }

    logger.info({ org_id: orgId }, 'Logo uploaded successfully');
    return NextResponse.json({
      success: true,
      logo_url: publicUrl,
      organization: updatedOrg
    })
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      org_id: orgId || 'unknown'
    }, 'Error in POST /api/organizations/[id]/logo');
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
  let orgId: string | undefined;
  try {
    const paramsData = await params;
    orgId = paramsData.id;
    const supabase = await createClientServer()

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check user is owner or admin
    const { data: membership } = await supabase
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
    const { data: org } = await supabase
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
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const oldPath = org.logo_url.split('/').pop()
    if (oldPath) {
      await adminSupabase.storage
        .from('materials')
        .remove([`org-logos/${oldPath}`])
    }

    // Update organization
    const { data: updatedOrg, error: updateError } = await supabase
      .from('organizations')
      .update({ logo_url: null })
      .eq('id', orgId)
      .select()
      .single()

    if (updateError) {
      logger.error({ 
        error: updateError.message,
        org_id: orgId
      }, 'Update error');
      return NextResponse.json(
        { error: 'Failed to update organization' },
        { status: 500 }
      )
    }

    logger.info({ org_id: orgId }, 'Logo deleted successfully');
    return NextResponse.json({
      success: true,
      organization: updatedOrg
    })
  } catch (error: any) {
    logger.error({ 
      error: error.message || String(error),
      stack: error.stack,
      org_id: orgId || 'unknown'
    }, 'Error in DELETE /api/organizations/[id]/logo');
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

