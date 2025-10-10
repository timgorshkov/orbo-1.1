import { fetchMaterialsTree } from './data';
import { MaterialsPageViewer } from '@/components/materials/materials-page-viewer';
import { createClientServer } from '@/lib/server/supabaseServer';
import { getUserRoleInOrg } from '@/lib/auth/getUserRole';

export default async function MaterialsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params
  const { tree, orgId: resolvedOrgId, orgName, orgLogoUrl } = await fetchMaterialsTree(orgId);

  // Определяем роль пользователя для режима только чтения
  const supabase = await createClientServer()
  const { data: { user } } = await supabase.auth.getUser()
  
  const role = user ? await getUserRoleInOrg(user.id, resolvedOrgId) : 'guest'
  const readOnly = role === 'member' // Только members видят в режиме чтения

  return (
    <MaterialsPageViewer 
      orgId={resolvedOrgId} 
      initialTree={tree} 
      orgName={orgName}
      orgLogoUrl={orgLogoUrl}
      readOnly={readOnly}
    />
  );
}

