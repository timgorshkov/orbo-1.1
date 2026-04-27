import { NextRequest, NextResponse } from 'next/server'
import { getAvailableGateways, type GatewayCode } from '@/lib/services/paymentGateway'
import { createAdminServer } from '@/lib/server/supabaseServer'

export const dynamic = 'force-dynamic'

/**
 * Online acquiring gateways currently supported by the pay-page UI.
 * `manual` (bank transfer) is filtered out — phase 9 of the billing plan
 * will re-enable it once Orbo's own bank account + fiscalisation flow lands.
 */
const ACQUIRING_GATEWAYS: GatewayCode[] = ['tbank', 'cloudpayments', 'yookassa', 'sbp']

function pickActiveGateway(orgActive: string | null | undefined, available: GatewayCode[]): GatewayCode | null {
  // 1. Org override takes precedence
  if (orgActive && available.includes(orgActive as GatewayCode)) {
    return orgActive as GatewayCode
  }
  // 2. Platform default from env (set by ops)
  const envDefault = process.env.DEFAULT_GATEWAY as GatewayCode | undefined
  if (envDefault && available.includes(envDefault)) {
    return envDefault
  }
  // 3. First acquiring gateway available
  for (const gw of ACQUIRING_GATEWAYS) {
    if (available.includes(gw)) return gw
  }
  return null
}

// GET /api/pay/gateways?orgId=...
//   Returns the single online gateway active for this org (filtered by
//   organizations.active_gateway), plus any non-acquiring fallbacks (e.g. SBP,
//   if separately enabled). Without orgId — returns the platform default.
export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get('orgId')
  const allAvailable = getAvailableGateways()

  let orgActive: string | null = null
  if (orgId) {
    const db = createAdminServer()
    const { data: org } = await db
      .from('organizations')
      .select('active_gateway')
      .eq('id', orgId)
      .single()
    orgActive = (org as any)?.active_gateway || null
  }

  const active = pickActiveGateway(orgActive, allAvailable)
  const codes: GatewayCode[] = active ? [active] : []

  const labelFor = (code: GatewayCode) => {
    switch (code) {
      case 'yookassa': return 'Банковская карта'
      case 'tbank': return 'Банковская карта'
      case 'cloudpayments': return 'Банковская карта'
      case 'sbp': return 'СБП (QR-код)'
      default: return code
    }
  }
  const iconFor = (code: GatewayCode) => {
    switch (code) {
      case 'yookassa':
      case 'tbank':
      case 'cloudpayments':
        return 'card'
      case 'sbp':
        return 'qr'
      default:
        return 'other'
    }
  }

  const gatewayInfo = codes.map(code => ({
    code,
    label: labelFor(code),
    icon: iconFor(code),
  }))

  return NextResponse.json({ gateways: gatewayInfo })
}
