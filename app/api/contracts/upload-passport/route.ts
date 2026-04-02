import { NextRequest, NextResponse } from 'next/server'
import { createAPILogger } from '@/lib/logger'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { uploadPassportPhoto } from '@/lib/storage'

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
