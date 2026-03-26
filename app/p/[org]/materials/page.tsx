import { fetchMaterialsTree } from '@/app/app/[org]/materials/data';
import { MaterialsPageViewer } from '@/components/materials/materials-page-viewer';
import { getPublicPortalAccess } from '@/lib/server/portalAccess';
import { checkMembershipGate } from '@/lib/server/membershipGate';
import { Lock } from 'lucide-react';
import Link from 'next/link';

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

  const access = await getPublicPortalAccess(resolvedOrgId)
  const role = access?.role ?? 'guest'

  // Check membership gate for members (skip for participant-session users — they're valid members)
  if (access?.userId && role !== 'owner' && role !== 'admin') {
    const gate = await checkMembershipGate({
      orgId: resolvedOrgId,
      userId: access.userId,
      resourceType: 'materials',
      role: role || undefined,
    })
    if (!gate.allowed) {
      return (
        <div className="flex items-center justify-center min-h-[60vh] px-4">
          <div className="text-center max-w-md">
            <Lock className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Доступ к материалам ограничен</h2>
            <p className="text-gray-500 mb-4">{gate.reason}</p>
            <Link href={`/p/${resolvedOrgId}/membership`} className="text-blue-600 hover:underline text-sm">
              Подробнее о членстве
            </Link>
          </div>
        </div>
      )
    }
  }

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
