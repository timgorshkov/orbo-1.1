import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'
import { getUserRoleInOrg } from '@/lib/auth/getUserRole'
import sharp from 'sharp'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ participantId: string }> }
) {
  try {
    const { participantId } = await params
    const supabase = await createClientServer()

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get form data
    const formData = await req.formData()
    const file = formData.get('file') as File
    const orgId = formData.get('orgId') as string

    if (!file || !orgId) {
      return NextResponse.json({ error: 'Missing file or orgId' }, { status: 400 })
    }

    // Check permissions (admin or own profile)
    const role = await getUserRoleInOrg(user.id, orgId)
    const isAdmin = role === 'owner' || role === 'admin'

    const adminSupabase = createAdminServer()
    const { data: participant } = await adminSupabase
      .from('participants')
      .select('tg_user_id, photo_url')
      .eq('id', participantId)
      .single()

    if (!participant) {
      return NextResponse.json({ error: 'Participant not found' }, { status: 404 })
    }

    // Check if own profile
    let isOwnProfile = false
    if (participant.tg_user_id) {
      const { data: telegramAccount } = await supabase
        .from('user_telegram_accounts')
        .select('user_id')
        .eq('telegram_user_id', participant.tg_user_id)
        .eq('org_id', orgId)
        .single()

      isOwnProfile = telegramAccount?.user_id === user.id
    }

    if (!isAdmin && !isOwnProfile) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Process image with sharp
    // ✅ Автоматическая обрезка по центру до квадрата и изменение размера
    const processedBuffer = await sharp(buffer)
      .resize(400, 400, { 
        fit: 'cover', // Обрезает по центру, сохраняя пропорции
        position: 'center' // Центрирование
      })
      .webp({ quality: 90 }) // Увеличена качество для лучшей четкости
      .toBuffer()

    // Delete old photo if exists
    if (participant.photo_url) {
      const oldPath = participant.photo_url.split('/').pop()
      if (oldPath) {
        await adminSupabase.storage
          .from('participant-photos')
          .remove([`${orgId}/${oldPath}`])
      }
    }

    // Upload to Supabase Storage
    const fileName = `${participantId}-${Date.now()}.webp`
    const filePath = `${orgId}/${fileName}`

    const { error: uploadError } = await adminSupabase.storage
      .from('participant-photos')
      .upload(filePath, processedBuffer, {
        contentType: 'image/webp',
        upsert: false,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload photo' }, { status: 500 })
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = adminSupabase.storage.from('participant-photos').getPublicUrl(filePath)

    // Update participant record
    const { error: updateError } = await adminSupabase
      .from('participants')
      .update({ photo_url: publicUrl })
      .eq('id', participantId)

    if (updateError) {
      console.error('Update error:', updateError)
      return NextResponse.json({ error: 'Failed to update participant' }, { status: 500 })
    }

    return NextResponse.json({ photo_url: publicUrl })
  } catch (error) {
    console.error('Photo upload error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ participantId: string }> }
) {
  try {
    const { participantId } = await params
    const supabase = await createClientServer()

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId } = await req.json()

    if (!orgId) {
      return NextResponse.json({ error: 'Missing orgId' }, { status: 400 })
    }

    // Check permissions
    const role = await getUserRoleInOrg(user.id, orgId)
    const isAdmin = role === 'owner' || role === 'admin'

    const adminSupabase = createAdminServer()
    const { data: participant } = await adminSupabase
      .from('participants')
      .select('tg_user_id, photo_url')
      .eq('id', participantId)
      .single()

    if (!participant) {
      return NextResponse.json({ error: 'Participant not found' }, { status: 404 })
    }

    // Check if own profile
    let isOwnProfile = false
    if (participant.tg_user_id) {
      const { data: telegramAccount } = await supabase
        .from('user_telegram_accounts')
        .select('user_id')
        .eq('telegram_user_id', participant.tg_user_id)
        .eq('org_id', orgId)
        .single()

      isOwnProfile = telegramAccount?.user_id === user.id
    }

    if (!isAdmin && !isOwnProfile) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Delete from storage
    if (participant.photo_url) {
      const oldPath = participant.photo_url.split('/').pop()
      if (oldPath) {
        await adminSupabase.storage
          .from('participant-photos')
          .remove([`${orgId}/${oldPath}`])
      }
    }

    // Update participant record
    const { error: updateError } = await adminSupabase
      .from('participants')
      .update({ photo_url: null })
      .eq('id', participantId)

    if (updateError) {
      console.error('Update error:', updateError)
      return NextResponse.json({ error: 'Failed to update participant' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Photo delete error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

