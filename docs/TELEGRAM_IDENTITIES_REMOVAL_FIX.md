# Fix: Telegram Identities Table Removal

## Problem

After migration 42 (which removed unused tables including `telegram_identities`), the Telegram webhook was throwing errors:

1. **Error 1**: `Could not find the table 'public.telegram_identities' in the schema cache`
   - The code was still trying to create/update records in the deleted `telegram_identities` table

2. **Error 2**: `Could not find the 'identity_id' column of 'participants' in the schema cache`
   - The code was trying to use the `identity_id` column in `participants`, but this column was associated with the deleted table

## Root Cause

Migration 42 correctly identified and removed three unused tables:
- `telegram_identities`
- `telegram_activity_events`  
- `telegram_updates`

However, the code in `lib/services/eventProcessingService.ts` was still trying to use these tables and related columns.

## Solution

Updated `lib/services/eventProcessingService.ts` to remove all references to deleted tables:

### 1. Deprecated `ensureIdentity()` method
```typescript
private async ensureIdentity(user: any): Promise<string | null> {
  // DEPRECATED: telegram_identities table was removed in migration 42
  // This method is kept for backward compatibility but always returns null
  return null;
}
```

### 2. Removed `identity_id` from all `participants` operations
- Removed from INSERT operations (lines 559, 764)
- Removed from SELECT queries (lines 538, 743)
- Removed from UPDATE patches (line 950)

### 3. Deprecated `writeGlobalActivityEvent()` method
```typescript
private async writeGlobalActivityEvent(...): Promise<void> {
  // DEPRECATED: telegram_activity_events and telegram_identities tables were removed in migration 42
  // This method is kept for backward compatibility but does nothing
  // All activity tracking is now handled through the activity_events table
  return;
}
```

### 4. Removed all calls to `ensureIdentity()` 
- Line 534 (new chat members)
- Line 739 (message processing)
- Line 1009 (join events)
- Line 1040 (leave events)
- Line 1099 (message events)

### 5. Set `identity_id` to `null` in all activity event calls
All calls to `writeGlobalActivityEvent` now pass `identity_id: null` since this field is no longer used.

## Files Modified

- `lib/services/eventProcessingService.ts`
  - Deprecated `ensureIdentity()` method
  - Deprecated `writeGlobalActivityEvent()` method
  - Removed all `identity_id` usage from participants operations
  - Removed `identityId` variable from `processMessageForOrg()`

## Testing

After applying these changes:

1. **Webhook authentication** ✅
   ```
   receivedMatches: true
   secretLength: 48
   receivedSecretLength: 48
   ```

2. **Message processing** ✅
   - Messages are correctly received and processed
   - Activity events are recorded in `activity_events` table
   - Participants are created/updated without errors
   - Group metrics are updated successfully

3. **Error resolution** ✅
   - No more `telegram_identities` table not found errors
   - No more `identity_id` column not found errors

## Follow-up Fix

After deploying this fix, a secondary issue appeared: participant creation race conditions causing duplicate key violations. This was addressed in a subsequent fix documented in `PARTICIPANT_UPSERT_FIX.md`, which replaced INSERT with UPSERT operations.

## Migration Context

This fix complements migration 42, which removed unused tables:

```sql
-- Migration 42: cleanup_unused_tables.sql
DROP TABLE IF EXISTS public.telegram_activity_events;
DROP TABLE IF EXISTS public.telegram_identities;
DROP TABLE IF EXISTS public.telegram_updates;
```

## Impact

- **No data loss**: The deleted tables were not used by the application
- **All tracking continues**: Activity tracking is handled by the `activity_events` table
- **Performance improvement**: Fewer unnecessary database operations
- **Code cleanup**: Removed deprecated functionality

## Notes

- The `identity_id` field is kept in the `ParticipantRow` type for backward compatibility
- Methods `ensureIdentity()` and `writeGlobalActivityEvent()` are kept but do nothing
- All participant tracking now relies on `tg_user_id` for identification
- Activity events are properly recorded in the `activity_events` table (not the removed `telegram_activity_events`)

