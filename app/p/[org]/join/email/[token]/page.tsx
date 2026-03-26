import { createAdminServer } from '@/lib/server/supabaseServer'
import { redirect } from 'next/navigation'
import InviteAcceptClient from './invite-accept-client'
import type { Metadata } from 'next'

interface Props {
  params: Promise<{ org: string; token: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { org: orgId } = await params
  const db = createAdminServer()
  const { data: org } = await db
    .from('organizations')
    .select('name, logo_url')
    .eq('id', orgId)
    .single()

  const name = org?.name || 'Сообщество'
  return { title: `Приглашение в ${name}` }
}

export default async function InviteEmailPage({ params }: Props) {
  const { org: orgId, token } = await params
  const db = createAdminServer()

  // Validate invite exists and is pending
  const { data: invite } = await db
    .from('participant_email_invites')
    .select('id, email, status, expires_at, org_id')
    .eq('token', token)
    .eq('org_id', orgId)
    .single()

  if (!invite) {
    redirect(`/p/${orgId}?invite_error=not_found`)
  }

  if (invite.status === 'accepted') {
    redirect(`/p/${orgId}?invite_accepted=1`)
  }

  if (invite.status !== 'pending' || new Date(invite.expires_at) < new Date()) {
    redirect(`/p/${orgId}?invite_error=expired`)
  }

  // Load org branding
  const { data: org } = await db
    .from('organizations')
    .select('id, name, logo_url, portal_cover_url, public_description')
    .eq('id', orgId)
    .single()

  if (!org) {
    redirect('/')
  }

  return (
    <InviteAcceptClient
      orgId={orgId}
      token={token}
      email={invite.email}
      org={org}
    />
  )
}
