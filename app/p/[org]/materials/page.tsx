import { fetchMaterialsTree } from '@/app/app/[org]/materials/data';
import { MaterialsPageViewer } from '@/components/materials/materials-page-viewer';
import { getUserRoleInOrg } from '@/lib/auth/getUserRole';
import { getUnifiedUser } from '@/lib/auth/unified-auth';

export default async function PublicMaterialsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const { org: orgId } = await params
  const { page: initialPageId } = await searchParams
  const { tree, orgId: resolvedOrgId, orgName, orgLogoUrl } = await fetchMaterialsTree(orgId);

  // Определяем роль пользователя для режима только чтения (unified auth)
  const user = await getUnifiedUser()

  const role = user ? await getUserRoleInOrg(user.id, resolvedOrgId) : 'guest'

  // ✅ Members и guests видят материалы в режиме чтения
  const readOnly = role === 'member' || role === 'guest'

  return (
    <MaterialsPageViewer
      orgId={resolvedOrgId}
      initialTree={tree}
      orgName={orgName}
      orgLogoUrl={orgLogoUrl}
      readOnly={readOnly}
      initialPageId={initialPageId ?? null}
    />
  );
}
