import { createAdminServer } from '@/lib/server/supabaseServer'
import { getUnifiedUser } from '@/lib/auth/unified-auth'
import { getParticipantSession } from '@/lib/participant-auth/session'
import PaymentPage from '@/components/payments/payment-page'
import { calculateFeesForOrg } from '@/lib/services/feeCalculationService'
import PaymentReturnHandler from '@/components/payments/payment-return-handler'

interface Props {
  params: Promise<{ org: string }>
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function PayPage({ params, searchParams }: Props) {
  const { org: orgId } = await params
  const query = await searchParams

  const db = createAdminServer()

  // Load org info
  const { data: org } = await db
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .single()

  if (!org) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-gray-500">
        Организация не найдена
      </div>
    )
  }

  // If returning from gateway with sessionId — show status handler
  if (query.sessionId) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <PaymentReturnHandler
          sessionId={query.sessionId}
          orgId={orgId}
          returnPath={query.returnPath || `/p/${orgId}/events`}
        />
      </div>
    )
  }

  // New payment — need type + registration/membership info
  const type = query.type as 'event' | 'membership' | undefined
  if (!type) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-gray-500">
        Не указан тип оплаты
      </div>
    )
  }

  // Get current user/participant
  const user = await getUnifiedUser()
  const participantSession = await getParticipantSession()

  let amount = 0
  let currency = 'RUB'
  let description = ''
  let eventId: string | undefined
  let eventRegistrationId: string | undefined
  let membershipPaymentId: string | undefined
  let participantId: string | undefined
  let returnPath = `/p/${orgId}/events`

  if (type === 'event' && query.registrationId) {
    // Load registration + event info (use default_price as fallback if price not set on registration)
    const { data: reg } = await db.raw(
      `SELECT er.id, er.price, er.event_id, er.participant_id, er.quantity,
              e.title, e.currency, e.default_price
       FROM event_registrations er
       JOIN events e ON e.id = er.event_id
       WHERE er.id = $1`,
      [query.registrationId]
    )

    if (reg && reg.length > 0) {
      const r = reg[0]
      const unitPrice = parseFloat(r.price) || parseFloat(r.default_price) || 0
      const qty = parseInt(r.quantity) || 1
      amount = unitPrice * qty
      currency = r.currency || 'RUB'
      description = `Участие: ${r.title}`
      eventId = r.event_id
      eventRegistrationId = r.id
      participantId = r.participant_id
      returnPath = `/p/${orgId}/events/${r.event_id}`
    }
  } else if (type === 'membership' && query.paymentId) {
    // Load membership payment info (join through participant_memberships to get plan name)
    const { data: mp } = await db.raw(
      `SELECT mp.id, mp.amount, mp.currency, mpl.name as plan_name, pm.participant_id
       FROM membership_payments mp
       JOIN participant_memberships pm ON pm.id = mp.membership_id
       JOIN membership_plans mpl ON mpl.id = pm.plan_id
       WHERE mp.id = $1`,
      [query.paymentId]
    )

    if (mp && mp.length > 0) {
      const p = mp[0]
      amount = parseFloat(p.amount) || 0
      currency = p.currency || 'RUB'
      description = `Членство: ${p.plan_name}`
      membershipPaymentId = p.id
      participantId = p.participant_id
      returnPath = query.returnPath || `/p/${orgId}/membership`
    }
  }

  if (amount <= 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-gray-500">
        Не удалось загрузить информацию об оплате
      </div>
    )
  }

  // Load bank details for manual transfer (from org contract)
  let bankDetails: {
    bankName: string
    bik: string
    correspondentAccount: string
    settlementAccount: string
    recipientName: string
  } | null = null
  const { data: contract } = await db.raw(
    `SELECT c.id, cp.full_name, cp.org_name, cp.type,
            ba.bank_name, ba.bik, ba.correspondent_account, ba.settlement_account
     FROM contracts c
     JOIN counterparties cp ON cp.id = c.counterparty_id
     JOIN bank_accounts ba ON ba.id = c.bank_account_id
     WHERE c.org_id = $1 AND c.status IN ('verified', 'signed')
     LIMIT 1`,
    [orgId]
  )

  if (contract && contract.length > 0) {
    const ct = contract[0]
    bankDetails = {
      bankName: ct.bank_name,
      bik: ct.bik,
      correspondentAccount: ct.correspondent_account,
      settlementAccount: ct.settlement_account,
      recipientName: ct.type === 'legal_entity' ? ct.org_name : ct.full_name,
    }
  }

  // Calculate service fee for display
  let serviceFeeAmount: number | undefined
  if (amount > 0 && bankDetails) {
    try {
      const fees = await calculateFeesForOrg(orgId, amount)
      serviceFeeAmount = fees.serviceFeeAmount
    } catch {
      // If fee calculation fails, just don't show it
    }
  }

  // Resolve payer email for the receipt — registration_data.email > participant.email > user.email.
  let payerEmail: string | undefined
  if (participantId) {
    const { data: participant } = await db
      .from('participants')
      .select('email')
      .eq('id', participantId)
      .single()
    if (participant?.email) payerEmail = participant.email
  }
  if (!payerEmail && user?.email) payerEmail = user.email
  if (!payerEmail && participantSession?.email) payerEmail = participantSession.email

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <PaymentPage
        orgId={orgId}
        orgName={org.name}
        paymentFor={type}
        amount={amount}
        currency={currency}
        description={description}
        serviceFeeAmount={serviceFeeAmount}
        eventId={eventId}
        eventRegistrationId={eventRegistrationId}
        membershipPaymentId={membershipPaymentId}
        participantId={participantId}
        userId={user?.id}
        returnPath={returnPath}
        bankDetails={bankDetails}
        cloudpaymentsPublicId={process.env.CLOUDPAYMENTS_PUBLIC_ID || undefined}
        payerEmail={payerEmail}
      />
    </div>
  )
}
