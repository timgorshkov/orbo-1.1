import { NextRequest, NextResponse } from 'next/server'
import { getAvailableGateways } from '@/lib/services/paymentGateway'

export const dynamic = 'force-dynamic'

// GET /api/pay/gateways — list available payment gateways
export async function GET(request: NextRequest) {
  const gateways = getAvailableGateways()

  // Map to user-friendly labels
  const gatewayInfo: Array<{ code: string; label: string; icon: string }> = gateways
    .filter(g => g !== 'manual') // Don't show manual to end users
    .map(code => ({
      code,
      label: code === 'yookassa' ? 'Банковская карта'
           : code === 'tbank' ? 'Банковская карта (T-Bank)'
           : code === 'sbp' ? 'СБП (QR-код)'
           : code,
      icon: code === 'yookassa' ? 'card'
          : code === 'tbank' ? 'card'
          : code === 'sbp' ? 'qr'
          : 'other',
    }))

  // Always add bank transfer option
  gatewayInfo.push({
    code: 'manual',
    label: 'Банковский перевод',
    icon: 'bank',
  })

  return NextResponse.json({ gateways: gatewayInfo })
}
