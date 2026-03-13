import { createAdminServer } from '@/lib/server/supabaseServer'
import { notFound } from 'next/navigation'
import { MembershipLandingContent } from '@/components/memberships/membership-landing'

export const dynamic = 'force-dynamic'

export default async function MembershipJoinPage({ params }: { params: { org: string } }) {
  const orgId = params.org
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

  return (
    <MembershipLandingContent
      org={org}
      plans={plans || []}
    />
  )
}
