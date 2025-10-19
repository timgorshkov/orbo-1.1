# Fix: Participant Creation Race Condition

## Problem

After deploying the fixes for `telegram_identities` table removal, a new error appeared:

```
Error creating participant from message: {
  code: '23505',
  details: 'Key (org_id, tg_user_id)=(dee0ecd3-9d2c-4277-b830-53421cff82bf, 154588486) already exists.',
  message: 'duplicate key value violates unique constraint "idx_participants_unique_tg_user_per_org"'
}
```

## Root Cause

The code had a race condition in participant creation logic:

1. **SELECT** to check if participant exists: `SELECT * FROM participants WHERE tg_user_id = X AND org_id = Y`
2. If not found → **INSERT** new participant
3. But if participant already exists → **Error 23505** (duplicate key violation)

This happened because:
- The initial SELECT didn't find the participant (possibly due to concurrent operations or missing `merged_into IS NULL` condition)
- The subsequent INSERT tried to create a participant that already existed
- PostgreSQL's unique constraint `idx_participants_unique_tg_user_per_org` prevented the duplicate

## Solution

Replaced `INSERT` with **UPSERT** (INSERT ... ON CONFLICT DO UPDATE) to make the operation atomic and idempotent:

### Before (problematic code):
```typescript
// Check if participant exists
const { data: participant } = await this.supabase
  .from('participants')
  .select('id, ...')
  .eq('tg_user_id', userId)
  .eq('org_id', orgId)
  .maybeSingle();

// If not found, try to insert
if (!participant) {
  const { data: newParticipant, error } = await this.supabase
    .from('participants')
    .insert({  // ❌ Can fail if participant exists
      org_id: orgId,
      tg_user_id: userId,
      // ...
    });
  
  if (error) {
    console.error('Error creating participant:', error);  // ❌ Error happens here
  }
}
```

### After (fixed code):
```typescript
// Check if participant exists (now with merged_into filter)
const { data: participant } = await this.supabase
  .from('participants')
  .select('id, ...')
  .eq('tg_user_id', userId)
  .eq('org_id', orgId)
  .is('merged_into', null)  // ✅ Ignore merged participants
  .maybeSingle();

// If not found, use UPSERT
if (!participant) {
  const { data: upsertedParticipant, error } = await this.supabase
    .from('participants')
    .upsert({  // ✅ Atomic operation
      org_id: orgId,
      tg_user_id: userId,
      // ...
    }, {
      onConflict: 'org_id,tg_user_id',  // ✅ Handle conflicts
      ignoreDuplicates: false            // ✅ Update existing row
    });
  
  if (error) {
    // Fallback: try to get existing participant
    const { data: existingParticipant } = await this.supabase
      .from('participants')
      .select('id, merged_into')
      .eq('tg_user_id', userId)
      .eq('org_id', orgId)
      .is('merged_into', null)
      .maybeSingle();
    
    if (existingParticipant) {
      participantId = existingParticipant.merged_into || existingParticipant.id;
    }
  }
}
```

## Changes Made

### File: `lib/services/eventProcessingService.ts`

#### 1. Fixed `processMessageForOrg()` method (line ~738)
- Added `.is('merged_into', null)` filter to SELECT query
- Replaced `.insert()` with `.upsert()` with `onConflict` option
- Added fallback logic to fetch existing participant if upsert fails

#### 2. Fixed new member processing (line ~534)
- Added `.is('merged_into', null)` filter to SELECT query
- Replaced `.insert()` with `.upsert()` with `onConflict` option
- Added fallback logic with `continue` statement if both upsert and fallback fail

## Benefits

1. **Eliminates race conditions**: UPSERT is atomic, no gap between SELECT and INSERT
2. **Idempotent operations**: Can safely retry failed operations without creating duplicates
3. **Better error handling**: Fallback mechanism ensures participant ID is found
4. **Respects merged participants**: `.is('merged_into', null)` filter prevents working with merged records
5. **Prevents duplicate errors**: Errors like `23505` no longer occur

## Testing

After deploying these changes:

1. ✅ No more duplicate key violation errors
2. ✅ Messages are processed successfully
3. ✅ Participants are correctly created or updated
4. ✅ Activity events are recorded properly
5. ✅ Group metrics are calculated correctly

## Related Issues

- This fix addresses the error that appeared after fixing the `telegram_identities` table removal
- Related to migration 39 (`prevent_duplicate_participants.sql`) which added unique constraints
- Complements the duplicate participant cleanup scripts

## Migration Context

This code fix works together with:
- Migration 39: `idx_participants_unique_tg_user_per_org` unique constraint
- Migration 42: Removed `telegram_identities` table
- Duplicate cleanup scripts: Merged existing duplicates

## Notes

- **UPSERT behavior**: Updates the row if it exists, inserts if it doesn't
- **onConflict**: Specifies which columns define uniqueness (`org_id,tg_user_id`)
- **ignoreDuplicates**: `false` means update existing rows (not ignore them)
- **Fallback logic**: Extra safety layer in case UPSERT fails for any reason
- **merged_into filter**: Ensures we work only with active (non-merged) participants

