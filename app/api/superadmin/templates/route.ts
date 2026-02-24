import { NextResponse } from 'next/server'
import { requireSuperadmin } from '@/lib/server/superadminGuard'
import { getAllTemplatesForPreview } from '@/lib/services/onboardingChainService'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await requireSuperadmin()
    const templates = getAllTemplatesForPreview()
    return NextResponse.json({ templates })
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
}
