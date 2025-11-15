import { redirect } from 'next/navigation'

export default async function OldTelegramPageRedirect({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params
  redirect(`/p/${orgId}/telegram`)
}

/*
// Old implementation - now redirects to /p/[org]/telegram
import { requireOrgAccess } from '@/lib/orgGuard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createClientServer } from '@/lib/server/supabaseServer'
import { createTelegramService } from '@/lib/services/telegramService'
import { AddGroupManuallyForm } from './form-components'
import { addGroupManually } from './actions'
import { DeleteGroupButton } from './delete-group-button'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TabsLayout from './tabs-layout'
... (content redirects to new /p/ structure)
*/
