import { Suspense } from 'react';
import { fetchMaterialsTree } from './data';
import { MaterialsTree } from '@/components/materials/materials-tree';
import { MaterialsEditorPlaceholder } from '@/components/materials/materials-editor-placeholder';
import { MaterialsPageViewer } from '@/components/materials/materials-page-viewer';

export default async function MaterialsPage({ params }: { params: { org: string } }) {
  const tree = await fetchMaterialsTree(params.org);

  return <MaterialsPageViewer orgId={params.org} initialTree={tree} />;
}

