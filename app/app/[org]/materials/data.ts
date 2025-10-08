'use server';

import { requireOrgAccess } from '@/lib/orgGuard';
import { MaterialService } from '@/lib/server/materials/service';

export async function fetchMaterialsTree(orgId: string) {
  await requireOrgAccess(orgId, undefined, ['owner', 'admin']);
  return MaterialService.getTree(orgId);
}

export async function fetchMaterialPage(orgId: string, pageId: string) {
  await requireOrgAccess(orgId, undefined, ['owner', 'admin']);
  return MaterialService.getPage(orgId, pageId);
}

