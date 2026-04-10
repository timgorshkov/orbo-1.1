import { NextRequest, NextResponse } from 'next/server'
import { getAvailableGateways } from '@/lib/services/paymentGateway'

export const dynamic = 'force-dynamic'

// GET /api/pay/gateways — list available payment gateways
export async function GET(request: NextRequest) {
  const gateways = getAvailableGateways()

  // Map to user-friendly labels (exclude manual — direct bank transfer disabled for now,
  // will be re-enabled in Phase 9 with Orbo's own bank account + fiscalization)
  const gatewayInfo: Array<{ code: string; label: string; icon: string; description?: string }> = gateways
    .filter(g => g !== 'manual')
    .map(code => ({
      code,
      label: code === 'yookassa' ? 'Банковская карта'
           : code === 'tbank' ? 'Банковская карта'
           : code === 'sbp' ? 'СБП (QR-код)'
           : code,
      icon: code === 'yookassa' ? 'card'
          : code === 'tbank' ? 'card'
          : code === 'sbp' ? 'qr'
          : 'other',
    }))

  return NextResponse.json({ gateways: gatewayInfo })
}
