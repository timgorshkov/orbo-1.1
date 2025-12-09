import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'
import { createClient } from '@supabase/supabase-js'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

// POST /api/events/[id]/cover - Upload event cover image
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params
    const supabase = await createClientServer()

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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

    // Create admin Supabase client for storage
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Delete old cover if exists and is from our bucket
    if (event.cover_image_url && event.cover_image_url.includes('/event-covers/')) {
      const urlParts = event.cover_image_url.split('/event-covers/')
      if (urlParts.length > 1) {
        const oldPath = urlParts[1].split('?')[0] // Remove query params
        await adminSupabase.storage
          .from('event-covers')
          .remove([oldPath])
      }
    }

    // Get file extension
    const ext = file.name.split('.').pop() || 'jpg'
    const fileName = `${eventId}-${Date.now()}.${ext}`
    const filePath = `${event.org_id}/${fileName}`

    // Upload new file
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { data: uploadData, error: uploadError } = await adminSupabase.storage
      .from('event-covers')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      )
    }

    // Get public URL
    const { data: { publicUrl } } = adminSupabase.storage
      .from('event-covers')
      .getPublicUrl(filePath)

    // Update event
    const { data: updatedEvent, error: updateError } = await supabase
      .from('events')
      .update({ cover_image_url: publicUrl })
      .eq('id', eventId)
      .select()
      .single()

    if (updateError) {
      console.error('Update error:', updateError)
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
    console.error('Error in POST /api/events/[id]/cover:', error)
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
  try {
    const { id: eventId } = await params
    const supabase = await createClientServer()

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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

    // Delete from storage if it's from our bucket
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    if (event.cover_image_url.includes('/event-covers/')) {
      const urlParts = event.cover_image_url.split('/event-covers/')
      if (urlParts.length > 1) {
        const oldPath = urlParts[1].split('?')[0] // Remove query params
        await adminSupabase.storage
          .from('event-covers')
          .remove([oldPath])
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
      console.error('Update error:', updateError)
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
    console.error('Error in DELETE /api/events/[id]/cover:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

