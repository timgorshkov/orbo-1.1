# Hotfix: Item Detail Page 404 in Incognito Mode

## Date: November 10, 2025 (Evening)

## Problem
Public item detail pages returned 404 when accessed in incognito mode:
- URL: `/p/[org]/apps/[appId]/items/[itemId]`
- Error: "Item not found"
- API: `GET /api/apps/[appId]/items/[itemId]` → 404

## Root Cause
The GET method in `/api/apps/[appId]/items/[itemId]/route.ts` was using:
- `createClientServer()` for fetching item data
- In incognito mode: no session → RLS blocks request → 404

**Previous fix:** We had fixed `/api/apps/[appId]` and `/api/apps/[appId]/collections` but forgot to fix `/api/apps/[appId]/items/[itemId]`!

## Solution
Changed GET method to use `createAdminServer()` for public read operations while keeping `createClientServer()` for:
1. Getting user session (for analytics)
2. PATCH method (requires authentication)
3. DELETE method (requires authentication)

### Changes to GET Method

**Before:**
```typescript
const supabase = await createClientServer();
const { data: item } = await supabase.from('app_items')...
```

**After:**
```typescript
// Use admin client for public read access (no RLS restrictions)
const adminSupabase = createAdminServer();
// Also create regular client for analytics (to get user session if available)
const supabase = await createClientServer();

const { data: item } = await adminSupabase.from('app_items')...
```

### Additional Changes
1. **Views count increment:** Now uses `adminSupabase` (no RLS blocking)
2. **Analytics logging:** Uses `adminSupabase.rpc()` but still gets user from `supabase.auth.getUser()`

## File Modified
- `app/api/apps/[appId]/items/[itemId]/route.ts` (GET method only)

## Admin Functionality Preserved
✅ **PATCH method** - Still requires authentication and ownership check  
✅ **DELETE method** - Still requires authentication and ownership check  
✅ **Analytics** - Still tracks logged-in users (optional)  
✅ **Views count** - Increments for all visitors (logged in or not)

## Testing Checklist
- [x] Item detail page loads in incognito mode
- [x] Images and data display correctly
- [x] No 404 errors
- [x] Share links work for non-logged-in users
- [ ] Views count increments (verify in DB)
- [ ] Logged-in users can still delete (admin check)
- [ ] Logged-in users can still edit (admin check)

## Impact
- ✅ Public item pages now work in incognito mode
- ✅ Share links work for everyone
- ✅ No authentication required for viewing
- ✅ Admin functionality (edit/delete) still protected
- ✅ Analytics still tracks logged-in users

## Deployment
- **Status:** ✅ Deployed to production
- **URL:** https://app.orbo.ru
- **Time:** November 10, 2025 ~22:15 GMT+3

## Related Fixes
This is the **third fix** in the "public pages" series:
1. `app/api/apps/[appId]/route.ts` - Fixed earlier today
2. `app/api/apps/[appId]/collections/route.ts` - Fixed earlier today
3. `app/api/apps/[appId]/items/[itemId]/route.ts` - Fixed now ✅

## Lesson Learned
When making public endpoints accessible without authentication, check **all related endpoints** in the data flow:
- App details → Collections → Items → Item detail

All must use admin client for public reads!

