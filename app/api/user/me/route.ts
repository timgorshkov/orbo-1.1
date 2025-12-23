import { NextResponse } from 'next/server'
import { getUnifiedUser } from '@/lib/auth/unified-auth'

export async function GET() {
  try {
    const user = await getUnifiedUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      provider: user.provider
    })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

