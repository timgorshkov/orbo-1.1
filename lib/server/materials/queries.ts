import { createAdminServer } from '@/lib/server/supabaseServer';

const supabaseAdmin = createAdminServer();

export type MaterialPageRow = {
  id: string;
  org_id: string;
  parent_id: string | null;
  title: string;
  slug: string | null;
  content_md: string;
  visibility: 'org_members' | 'admins_only';
  is_published: boolean;
  position: number;
  created_at: string;
  updated_at: string;
};

export async function fetchMaterialTree(orgId: string): Promise<MaterialPageRow[]> {
  const { data, error } = await supabaseAdmin
    .from('material_pages')
    .select('id, org_id, parent_id, title, slug, content_md, visibility, is_published, position, created_at, updated_at')
    .eq('org_id', orgId)
    .order('parent_id', { ascending: true, nullsFirst: true })
    .order('position', { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function fetchMaterialPage(orgId: string, pageId: string): Promise<MaterialPageRow | null> {
  const { data, error } = await supabaseAdmin
    .from('material_pages')
    .select('id, org_id, parent_id, title, slug, content_md, visibility, is_published, position, created_at, updated_at')
    .eq('org_id', orgId)
    .eq('id', pageId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function fetchMaterialPageById(pageId: string): Promise<MaterialPageRow | null> {
  const { data, error } = await supabaseAdmin
    .from('material_pages')
    .select('id, org_id, parent_id, title, slug, content_md, visibility, is_published, position, created_at, updated_at')
    .eq('id', pageId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function insertMaterialPage(page: {
  orgId: string;
  parentId?: string | null;
  title: string;
  slug?: string | null;
  contentMd?: string;
  visibility?: 'org_members' | 'admins_only';
  createdBy?: string | null;
}): Promise<MaterialPageRow> {
  const payload: Record<string, unknown> = {
    org_id: page.orgId,
    parent_id: page.parentId ?? null,
    title: page.title,
    slug: page.slug ?? null,
    content_md: page.contentMd ?? '',
    visibility: page.visibility ?? 'org_members',
    created_by: page.createdBy ?? null,
    updated_by: page.createdBy ?? null
  };

  const { data, error } = await supabaseAdmin
    .from('material_pages')
    .insert(payload)
    .select('id, org_id, parent_id, title, slug, content_md, visibility, is_published, position, created_at, updated_at')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateMaterialPage(pageId: string, patch: Partial<{ title: string; slug: string | null; content_md: string; visibility: 'org_members' | 'admins_only'; position: number; parent_id: string | null; updated_by: string | null }>) {
  if (Object.keys(patch).length === 0) {
    return fetchMaterialPageById(pageId);
  }

  const { data, error } = await supabaseAdmin
    .from('material_pages')
    .update(patch)
    .eq('id', pageId)
    .select('id, org_id, parent_id, title, slug, content_md, visibility, is_published, position, created_at, updated_at')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteMaterialPage(pageId: string) {
  const { error } = await supabaseAdmin
    .from('material_pages')
    .delete()
    .eq('id', pageId);

  if (error) {
    throw error;
  }
}

export async function searchMaterials(orgId: string, query: string, limit = 20) {
  const { data, error } = await supabaseAdmin
    .from('material_search_index')
    .select('page_id, title')
    .eq('org_id', orgId)
    .ilike('title', `%${query}%`)
    .limit(limit);

  if (error) {
    throw error;
  }

  return data ?? [];
}

