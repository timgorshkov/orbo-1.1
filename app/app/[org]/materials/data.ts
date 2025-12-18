'use server';

import { requireOrgAccess } from '@/lib/orgGuard';
import { MaterialService } from '@/lib/server/materials/service';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { cookies } from 'next/headers';
import { createServiceLogger } from '@/lib/logger';

export async function fetchMaterialsTree(orgIdentifier: string) {
  const logger = createServiceLogger('MaterialsData', { orgIdentifier });
  const cookieStore = cookies();
  await requireOrgAccess(orgIdentifier, cookieStore, ['owner', 'admin', 'member']);

  const admin = createAdminServer();

  // Проверяем, является ли идентификатор UUID или slug
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgIdentifier);

  logger.debug({ isUUID }, 'Fetching materials tree');

  const { data: org, error } = await admin
    .from('organizations')
    .select('id, name, logo_url')
    .eq(isUUID ? 'id' : 'slug', orgIdentifier)
    .single();

  if (error) {
    logger.warn({ error: error.message }, 'Organization query failed');
  }

  if (!org) {
    throw new Error(`Organization not found: ${orgIdentifier} (isUUID: ${isUUID}, error: ${error?.message})`);
  }

  const tree = await MaterialService.getTree(org.id);

  return { tree, orgId: org.id, orgName: org.name, orgLogoUrl: org.logo_url };
}

export async function fetchMaterialPage(orgIdentifier: string, pageId: string) {
  const cookieStore = cookies();
  await requireOrgAccess(orgIdentifier, cookieStore, ['owner', 'admin', 'member']);

  const admin = createAdminServer();

  // Проверяем, является ли идентификатор UUID или slug
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgIdentifier);

  const { data: org } = await admin
    .from('organizations')
    .select('id')
    .eq(isUUID ? 'id' : 'slug', orgIdentifier)
    .single();

  if (!org) {
    throw new Error('Organization not found');
  }

  return MaterialService.getPage(org.id, pageId);
}

