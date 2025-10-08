import { fetchMaterialPage, fetchMaterialPageById, fetchMaterialTree, insertMaterialPage, updateMaterialPage, deleteMaterialPage, searchMaterials, MaterialPageRow } from './queries';

const MAX_TREE_DEPTH = 3;

export type MaterialTreeNode = MaterialPageRow & { children: MaterialTreeNode[] };

export class MaterialService {
  static buildTree(rows: MaterialPageRow[]): MaterialTreeNode[] {
    const byId = new Map<string, MaterialTreeNode>();
    const roots: MaterialTreeNode[] = [];

    rows.forEach(row => {
      byId.set(row.id, { ...row, children: [] });
    });

    rows.forEach(row => {
      const node = byId.get(row.id)!;
      if (row.parent_id && byId.has(row.parent_id)) {
        byId.get(row.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  static async getTree(orgId: string) {
    const rows = await fetchMaterialTree(orgId);
    return MaterialService.buildTree(rows);
  }

  static async getPage(orgId: string, pageId: string) {
    return fetchMaterialPage(orgId, pageId);
  }

  static async createPage(options: { orgId: string; parentId?: string | null; title: string; slug?: string | null; contentMd?: string; visibility?: 'org_members' | 'admins_only'; createdBy?: string | null }) {
    if (options.parentId) {
      const parent = await fetchMaterialPage(options.orgId, options.parentId);
      if (!parent) {
        throw new Error('Parent page not found');
      }
    }

    const existingTree = await fetchMaterialTree(options.orgId);
    const parentDepth = MaterialService.calculateDepth(existingTree, options.parentId ?? null);
    if (parentDepth + 1 > MAX_TREE_DEPTH) {
      throw new Error('Maximum tree depth exceeded');
    }

    return insertMaterialPage(options);
  }

  static calculateDepth(rows: MaterialPageRow[], parentId: string | null | undefined): number {
    if (!parentId) {
      return 0;
    }
    const parent = rows.find(row => row.id === parentId);
    if (!parent) {
      return 0;
    }
    return 1 + MaterialService.calculateDepth(rows, parent.parent_id);
  }

  static async updatePage(pageId: string, patch: Partial<{ title: string; slug: string | null; content_md: string; visibility: 'org_members' | 'admins_only'; position: number; parent_id: string | null; updated_by: string | null }>) {
    return updateMaterialPage(pageId, patch);
  }

  static async movePage(options: { pageId: string; newParentId: string | null; newPosition: number }) {
    const page = await fetchMaterialPageById(options.pageId);
    if (!page) {
      throw new Error('Page not found');
    }

    if (options.newParentId) {
      const parent = await fetchMaterialPage(page.org_id, options.newParentId);
      if (!parent) {
        throw new Error('Target parent not found');
      }

      const tree = await fetchMaterialTree(page.org_id);
      const parentDepth = MaterialService.calculateDepth(tree, options.newParentId);
      if (parentDepth + 1 > MAX_TREE_DEPTH) {
        throw new Error('Maximum tree depth exceeded');
      }
    }

    return updateMaterialPage(options.pageId, {
      parent_id: options.newParentId,
      position: options.newPosition
    });
  }

  static async deletePage(pageId: string) {
    await deleteMaterialPage(pageId);
  }

  static async search(orgId: string, query: string) {
    return searchMaterials(orgId, query);
  }
}
