import { NextRequest, NextResponse } from 'next/server'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { calculateFeesForOrg, getOrgFeeConfig } from '@/lib/services/feeCalculationService'

/**
 * GET /api/events/[id]/price
 * Возвращает breakdown цены для события (с учётом сервисного сбора).
 * Публичный эндпоинт — не требует аутентификации.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const eventId = params.id
  const db = createAdminServer()

  // Получаем событие с ценой
  const { data: event, error } = await db
    .from('events')
    .select('id, org_id, default_price, currency, requires_payment, payment_link')
    .eq('id', eventId)
    .single()

  if (error || !event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  if (!event.requires_payment || !event.default_price) {
    return NextResponse.json({ error: 'Event is not paid' }, { status: 400 })
  }

  // Проверяем наличие контракта для ОРБО-платежей
  const feeConfig = await getOrgFeeConfig(event.org_id)

  // Если нет активного контракта или используется внешний payment_link — нет breakdown
  if (!feeConfig.hasActiveContract || event.payment_link) {
    return NextResponse.json({
      totalAmount: parseFloat(event.default_price),
      ticketPrice: parseFloat(event.default_price),
      serviceFeeRate: 0,
      serviceFeeAmount: 0,
      currency: event.currency || 'RUB',
      hasOrboPayments: false,
    })
  }

  const totalAmount = parseFloat(event.default_price)
  const fees = await calculateFeesForOrg(event.org_id, totalAmount)

  return NextResponse.json({
    totalAmount: fees.totalAmount,
    ticketPrice: fees.ticketPrice,
    serviceFeeRate: fees.serviceFeeRate,
    serviceFeeAmount: fees.serviceFeeAmount,
    currency: event.currency || 'RUB',
    hasOrboPayments: true,
  })
}
