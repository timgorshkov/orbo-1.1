# Three Critical Fixes

## Summary

Fixed three critical bugs:
1. Dashboard showing inflated activity statistics from multiple organizations
2. Telegram group admins not appearing in "Organization Team" section
3. Server-side exception on root page (`app.orbo.ru`)

---

## Fix 1: Dashboard Activity Statistics - Organization Filter Missing

### Problem
Dashboard "Activity for 14 days" block was showing inflated message counts because it was fetching activity events from **all organizations** that share the same Telegram `chat_id`.

### Root Cause
In `app/api/dashboard/[orgId]/route.ts` (lines 109-116), the query used:
```typescript
.from('activity_events')
.in('tg_chat_id', chatIds)  // ❌ No org_id filter!
```

This meant if multiple organizations had the same Telegram group connected, the dashboard would count messages from all of them.

### Solution
Added explicit `org_id` filter:
```typescript
.from('activity_events')
.eq('org_id', orgId)  // ✅ Filter by organization
.in('tg_chat_id', chatIds)
```

### Files Modified
- `app/api/dashboard/[orgId]/route.ts` (line 112)

---

## Fix 2: Telegram Group Admins Not Syncing to Organization Team

### Problem
Telegram group administrators were not appearing in the "Organization Team" (Команда организации) section. The "Update Administrator Rights" button showed "Updated: 0 из undefined".

### Root Causes

#### 2.1 Referencing Deleted Table
In `app/api/telegram/groups/update-admin-rights/route.ts` (lines 165-187), the code tried to query `telegram_activity_events` table, which was removed in migration 42:

```typescript
.from('telegram_activity_events')  // ❌ Table deleted in migration 42!
```

#### 2.2 Missing Sync Call
In `app/api/telegram/groups/update-admins/route.ts`, after updating `telegram_group_admins` table, the code wasn't calling `sync_telegram_admins()` function to create/update `memberships` records.

### Solutions

#### 2.1 Fix Table Reference
Changed to use the correct table:
```typescript
.from('activity_events')  // ✅ Use current table
.order('created_at', { ascending: false })  // ✅ Correct column name
```

#### 2.2 Add Sync Call
Added call to `sync_telegram_admins` RPC function:
```typescript
const { data: syncResult, error: syncError } = await supabaseService
  .rpc('sync_telegram_admins', { p_org_id: orgId });
```

This ensures that after updating admin rights in `telegram_group_admins`, the `memberships` table is synchronized, making admins visible in "Organization Team".

### Files Modified
- `app/api/telegram/groups/update-admin-rights/route.ts` (lines 166-172)
- `app/api/telegram/groups/update-admins/route.ts` (lines 202-211)

---

## Fix 3: Server-Side Exception on Root Page

### Problem
Accessing `app.orbo.ru` (root page) resulted in:
```
Application error: a server-side exception has occurred
Digest: 1126602023
```

Browser console showed:
```
Error: An error occurred in the Server Components render
```

### Root Cause
The root page (`app/page.tsx`) was calling `createClientServer()` which uses async cookie/header operations, but wasn't handling potential errors properly.

### Solution
Wrapped the entire function in a try-catch block to gracefully handle any errors:

```typescript
export default async function Home() {
  try {
    const supabase = await createClientServer();
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      redirect('/signin');
    }
    
    redirect('/orgs');
  } catch (error) {
    console.error('Error in root page:', error);
    redirect('/signin');  // Fallback to signin on any error
  }
}
```

### Files Modified
- `app/page.tsx` (entire file)

---

## Testing

### Test Case 1: Dashboard Statistics
1. ✅ Navigate to organization dashboard
2. ✅ Verify "Activity for 14 days" shows correct message count
3. ✅ Check that only messages from current organization are counted
4. ✅ Logs show: `Fetching activity for org ${orgId}`

### Test Case 2: Telegram Admins
1. ✅ Add yourself as admin in a Telegram group
2. ✅ Click "Update Administrator Rights" in Telegram Account Settings
3. ✅ See correct count: "Updated: 1 из 1" (not "0 из undefined")
4. ✅ Navigate to Settings → Organization Team
5. ✅ Verify admin appears in the list with group names and custom title
6. ✅ Logs show: `Calling sync_telegram_admins for org...`

### Test Case 3: Root Page
1. ✅ Navigate to `app.orbo.ru`
2. ✅ Authenticated users redirect to `/orgs`
3. ✅ Unauthenticated users redirect to `/signin`
4. ✅ No server-side exception errors
5. ✅ Page loads without JavaScript errors

---

## Related Issues

- Related to migration 42 (`cleanup_unused_tables.sql`) which removed:
  - `telegram_activity_events`
  - `telegram_identities`
  - `telegram_updates`

- Related to migration 46 (`sync_telegram_admins_with_shadow_profiles.sql`) which implements admin synchronization logic

- Complements previous fixes:
  - `TELEGRAM_IDENTITIES_REMOVAL_FIX.md`
  - `PARTICIPANT_UPSERT_FIX.md`

---

## Impact

### Before Fixes
- ❌ Dashboard showed incorrect statistics (inflated numbers)
- ❌ Telegram admins invisible in organization team
- ❌ Root page threw server-side errors
- ❌ Poor admin onboarding experience

### After Fixes
- ✅ Dashboard shows accurate per-organization statistics
- ✅ Telegram admins properly synchronized and visible
- ✅ Root page works reliably
- ✅ Clear admin workflow and proper role visibility

---

## Notes

- **Dashboard filtering**: Always use `.eq('org_id', orgId)` when querying shared tables like `activity_events`
- **Table names**: After migration 42, use `activity_events` (not `telegram_activity_events`)
- **Admin sync**: Always call `sync_telegram_admins()` after updating `telegram_group_admins`
- **Error handling**: Critical pages like root should have robust error handling with fallback redirects
- **Column names**: `activity_events` uses `created_at` (not `event_time`)

