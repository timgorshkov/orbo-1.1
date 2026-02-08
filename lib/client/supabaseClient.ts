/**
 * @deprecated REMOVED - Supabase has been removed from the project (January 2026).
 * 
 * This stub replaces the old Supabase browser client.
 * 
 * Remaining legacy pages that call this (TODO: migrate to API routes):
 * - app/p/[org]/telegram/groups/[id]/page.tsx
 * - app/app/[org]/telegram/message/page.tsx
 * 
 * These pages will fail at runtime. After migrating them — DELETE this module.
 */

// Dummy chainable query builder that logs errors
function createDummyQueryBuilder(): any {
  const handler: ProxyHandler<any> = {
    get(_target, prop) {
      if (prop === 'then') return undefined; // Not a thenable
      if (prop === 'data') return null;
      if (prop === 'error') return { message: 'Supabase has been removed. Migrate to API routes.' };
      // Return chainable proxy for any method call
      return (..._args: any[]) => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
}

/**
 * @deprecated Supabase removed. Use fetch('/api/...') instead.
 */
export function createClientBrowser(): any {
  console.error('[REMOVED] createClientBrowser: Supabase has been removed from the project. Migrate to API routes.');
  return {
    from: () => createDummyQueryBuilder(),
    auth: createDummyQueryBuilder(),
    rpc: () => createDummyQueryBuilder(),
    storage: createDummyQueryBuilder(),
  };
}
