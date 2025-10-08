import { fetchMaterialsTree } from './data';
import { MaterialsPageViewer } from '@/components/materials/materials-page-viewer';

export default async function MaterialsPage({ params }: { params: { org: string } }) {
  const { tree, orgId, orgName, orgLogoUrl } = await fetchMaterialsTree(params.org);

  return (
    <MaterialsPageViewer 
      orgId={orgId} 
      initialTree={tree} 
      orgName={orgName}
      orgLogoUrl={orgLogoUrl}
    />
  );
}

