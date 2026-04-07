import { createAdminServer } from '@/lib/server/supabaseServer'
import { notFound } from 'next/navigation'
import { MembershipLandingContent } from '@/components/memberships/membership-landing'

export const dynamic = 'force-dynamic'

export default async function MembershipJoinPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params;
  const supabase = createAdminServer()

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, logo_url, description')
    .eq('id', orgId)
    .single()

  if (!org) notFound()

  const { data: plans } = await supabase
    .from('membership_plans')
    .select('id, name, description, price, currency, billing_period, custom_period_days, trial_days, is_public, payment_link, payment_instructions')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .eq('is_public', true)
    .order('sort_order', { ascending: true })

  // Check if org has active Orbo payments (verified/signed contract)
  const { data: contracts } = await supabase.raw(
    `SELECT id FROM contracts WHERE org_id = $1 AND status IN ('verified', 'signed') LIMIT 1`,
    [orgId]
  )
  const hasOrboPayments = contracts && contracts.length > 0

  return (
    <MembershipLandingContent
      org={org}
      plans={plans || []}
      hasOrboPayments={hasOrboPayments}
    />
  )
}
