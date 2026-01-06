import { getUnifiedSession } from '@/lib/auth/unified-auth'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await getUnifiedSession()

  return NextResponse.json({
    authenticated: !!session?.user,
    user: session?.user ? {
      id: session.user.id,
      email: session.user.email,
    } : null,
  })
}
