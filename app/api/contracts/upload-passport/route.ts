import { NextRequest, NextResponse } from 'next/server'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getEffectiveOrgRole } from '@/lib/server/orgAccess'
import { uploadPassportPhoto } from '@/lib/storage'

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

export async function POST(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: 'contracts/upload-passport' })

  try {
    const user = await getUnifiedUser()
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const counterpartyId = formData.get('counterpartyId') as string | null
    const photoIndex = formData.get('photoIndex') as string | null

    if (!file || !counterpartyId || !photoIndex) {
      return NextResponse.json({ error: 'Missing file, counterpartyId, or photoIndex' }, { status: 400 })
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Only JPEG, PNG, WebP and PDF files are allowed' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 400 })
    }

    const orgIdMatch = counterpartyId.match(/^temp-([0-9a-f-]{36})$/i)
    if (!orgIdMatch) {
      return NextResponse.json({ error: 'Invalid counterparty ID format' }, { status: 400 })
    }
    const orgId = orgIdMatch[1]
    const role = await getEffectiveOrgRole(user.id, orgId)
    if (!role || !['owner', 'admin'].includes(role.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const index = photoIndex === '1' ? 1 : 2
    const buffer = Buffer.from(await file.arrayBuffer())
    const { url, error } = await uploadPassportPhoto(counterpartyId, index as 1 | 2, buffer, file.type)

    if (error) {
      logger.error({ error: error.message }, 'Failed to upload passport photo')
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }

    return NextResponse.json({ url })
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Error uploading passport')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
