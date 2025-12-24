import { requireOrgAccess } from '@/lib/orgGuard'
import { notFound } from 'next/navigation'
import { createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'
import WhatsAppGroupDetail from './whatsapp-group-detail'

export default async function WhatsAppGroupPage({ 
  params 
}: { 
  params: Promise<{ org: string; importId: string }> 
}) {
  const logger = createServiceLogger('WhatsAppGroupPage');
  
  try {
    const { org: orgId, importId } = await params;
    const { role } = await requireOrgAccess(orgId);
    
    const adminSupabase = createAdminServer();
    
    // Fetch import details with tag info
    const { data: importData, error } = await adminSupabase
      .from('whatsapp_imports')
      .select(`
        *,
        participant_tags (
          id,
          name,
          color
        )
      `)
      .eq('id', importId)
      .eq('org_id', orgId)
      .single();
    
    if (error || !importData) {
      logger.warn({ importId, orgId, error: error?.message }, 'Import not found');
      return notFound();
    }
    
    // Fetch available tags for the org
    const { data: availableTags } = await adminSupabase
      .from('participant_tags')
      .select('id, name, color')
      .eq('org_id', orgId)
      .order('name');
    
    return (
      <WhatsAppGroupDetail 
        orgId={orgId}
        importData={importData}
        availableTags={availableTags || []}
        isAdmin={['owner', 'admin'].includes(role)}
      />
    );
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error)
    }, 'WhatsApp group page error');
    return notFound();
  }
}

