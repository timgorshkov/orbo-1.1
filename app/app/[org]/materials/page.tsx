import { fetchMaterialsTree } from './data';
import { MaterialsPageViewer } from '@/components/materials/materials-page-viewer';
import { getUserRoleInOrg } from '@/lib/auth/getUserRole';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

export default async function MaterialsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params
  const { tree, orgId: resolvedOrgId, orgName, orgLogoUrl } = await fetchMaterialsTree(orgId);

  // Определяем роль пользователя для режима только чтения (unified auth)
  const user = await getUnifiedUser()
  
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

