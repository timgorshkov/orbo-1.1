import { requireOrgAccess } from '@/lib/orgGuard'
import { notFound } from 'next/navigation'
import TabsLayout from '../tabs-layout'
import { createAdminServer } from '@/lib/server/supabaseServer'
import WhatsAppContent from './whatsapp-content'

export default async function WhatsAppPage({ params }: { params: Promise<{ org: string }> }) {
  try {
    const { org: orgId } = await params
    await requireOrgAccess(orgId)
    
    // Load imports on server
    const adminSupabase = createAdminServer()
    const { data: imports, error } = await adminSupabase
      .from('whatsapp_imports')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50)
    
    if (error) {
      console.error('[WhatsApp Page] Error loading imports:', error)
    }
    
    // Calculate totals
    const totalParticipants = imports?.reduce((sum, imp) => sum + (imp.participants_created || 0), 0) || 0
    const totalMessages = imports?.reduce((sum, imp) => sum + (imp.messages_imported || 0), 0) || 0
    
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Настройки мессенджеров</h1>
        </div>
        
        <TabsLayout orgId={orgId}>
          <WhatsAppContent 
            orgId={orgId}
            initialImports={imports || []}
            totalParticipants={totalParticipants}
            totalMessages={totalMessages}
          />
        </TabsLayout>
      </div>
    )
  } catch (error) {
    console.error('WhatsApp page error:', error)
    return notFound()
  }
}
