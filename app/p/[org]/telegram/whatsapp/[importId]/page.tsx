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
    
    // Fetch import details
    const { data: importDataRaw, error } = await adminSupabase
      .from('whatsapp_imports')
      .select('*')
      .eq('id', importId)
      .eq('org_id', orgId)
      .single();
    
    if (error || !importDataRaw) {
      logger.warn({ importId, orgId, error: error?.message }, 'Import not found');
      return notFound();
    }
    
    // Fetch available tags for the org
    const { data: availableTags } = await adminSupabase
      .from('participant_tags')
      .select('id, name, color')
      .eq('org_id', orgId)
      .order('name');
    
    // Get linked tag if default_tag_id exists
    let linkedTag = null;
    if (importDataRaw.default_tag_id) {
      const { data: tagData } = await adminSupabase
        .from('participant_tags')
        .select('id, name, color')
        .eq('id', importDataRaw.default_tag_id)
        .single();
      linkedTag = tagData;
    }
    
    const importData = {
      ...importDataRaw,
      participant_tags: linkedTag
    };
    
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

