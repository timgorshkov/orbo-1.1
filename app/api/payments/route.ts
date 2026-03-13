import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const DEPRECATED_MSG = 'Этот API устарел. Используйте /api/membership-payments'

export async function GET() {
  return NextResponse.json({ error: DEPRECATED_MSG, redirect: '/api/membership-payments' }, { status: 410 })
}
export async function POST() {
  return NextResponse.json({ error: DEPRECATED_MSG }, { status: 410 })
}
export async function PATCH() {
  return NextResponse.json({ error: DEPRECATED_MSG }, { status: 410 })
}
