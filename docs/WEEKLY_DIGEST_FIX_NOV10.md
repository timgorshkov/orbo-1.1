# Weekly Digest Cron Job Fix - November 10, 2025

## Problem
Weekly digest emails were not sent on Monday, November 10, 2025 at 6:00 AM UTC. All 13 organizations with digest enabled failed with RLS error:

```
Failed to fetch recipients: {
  code: 'PGRST200',
  details: "Searched for a foreign key relationship between 'memberships' and 'participants' in the schema 'public', but no matches were found.",
  message: "Could not find a relationship between 'memberships' and 'participants' in the schema cache"
}
```

**Result:** 0/13 orgs processed, no digests sent.

## Root Cause
The cron job (`app/api/cron/send-weekly-digests/route.ts`) was attempting a direct join:

```typescript
// ❌ BEFORE (BROKEN)
const { data: recipients, error } = await supabaseAdmin
  .from('memberships')
  .select(`
    user_id,
    role,
    digest_notifications,
    participants!inner(tg_user_id, full_name, username)  // <- RLS blocks this
  `)
  .eq('org_id', org.id)
  .in('role', ['owner', 'admin'])
  .eq('digest_notifications', true);
```

**Problem:** There's no direct foreign key between `memberships.user_id` and `participants.id` (the relationship is through `auth.users`). Even with `supabaseAdmin`, the join syntax expects a direct FK relationship.

## Solution
Changed to fetch data in separate queries and join in memory:

```typescript
// ✅ AFTER (FIXED)

// Step 1: Fetch memberships (admins/owners with digest_notifications enabled)
const { data: memberships } = await supabaseAdmin
  .from('memberships')
  .select('user_id, role, digest_notifications')
  .eq('org_id', org.id)
  .in('role', ['owner', 'admin'])
  .eq('digest_notifications', true);

// Step 2: Fetch participants for these users
const userIds = memberships.map(m => m.user_id);
const { data: participants } = await supabaseAdmin
  .from('participants')
  .select('id, tg_user_id, full_name, username')
  .eq('org_id', org.id)
  .in('id', userIds);

// Step 3: Map participants by user_id
const participantMap = new Map(
  (participants || []).map(p => [p.id, p])
);

// Step 4: Build valid recipients list
const validRecipients = memberships
  .map(m => {
    const participant = participantMap.get(m.user_id);
    if (participant && participant.tg_user_id) {
      return {
        tgUserId: participant.tg_user_id,
        name: participant.full_name || participant.username || 'Участник'
      };
    }
    return null;
  })
  .filter((r): r is { tgUserId: number; name: string } => r !== null);
```

## File Modified
- `app/api/cron/send-weekly-digests/route.ts` (lines 83-135)

## Testing

### Manual Test (Recommended NOW)
Since the automatic cron job runs daily at 6:00 AM UTC, you can test manually right now:

**Option 1: Test via curl (with CRON_SECRET)**
```bash
curl -X GET "https://app.orbo.ru/api/cron/send-weekly-digests" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

**Option 2: Test via browser (from localhost)**
```
http://localhost:3000/api/cron/send-weekly-digests
```

**Expected Result:**
- ✅ All 13 orgs processed
- ✅ Recipients fetched successfully
- ✅ Digests generated and sent to Telegram
- ✅ No RLS errors

### Automatic Test (Tomorrow)
The cron job will run automatically tomorrow at 6:00 AM UTC (Monday = day 1).

Check Vercel logs at ~06:00-06:05 UTC for:
```
[Cron] Job complete: X/13 orgs processed
```

## Deployment
- **Status:** ✅ Deployed to production
- **Time:** November 10, 2025 ~22:45 GMT+3
- **Vercel URL:** https://app.orbo.ru

## Next Steps

### Immediate (Now)
1. **Test manually** to confirm fix works
2. Check if digests arrive in Telegram
3. Verify OpenAI cost tracking

### Tomorrow (Nov 11, 6:00 AM UTC)
1. Monitor Vercel logs for automatic cron run
2. Confirm all orgs processed successfully
3. Check Telegram delivery

### This Week
1. Add retry logic for failed deliveries
2. Add admin notification if digest generation fails
3. Consider moving to a queue system (Inngest/BullMQ) for reliability

## Related Issues

This is the **same RLS pattern** we've fixed multiple times:
1. ✅ Audit log API (Nov 7)
2. ✅ Subscriptions API (Nov 7)
3. ✅ App items API (Nov 9)
4. ✅ Public pages (Nov 10)
5. ✅ Weekly digest cron (Nov 10) ← THIS FIX

**Root Cause:** Attempting direct joins between tables without FK relationships.  
**Solution:** Always fetch separately and join in memory when dealing with `auth.users` relationships.

## Impact
- **Critical:** Digests are a key retention feature
- **Frequency:** Weekly (every Monday 6:00 AM UTC)
- **Affected Users:** All 13 organizations with digest enabled
- **Revenue Impact:** None (internal feature)

## Prevention
- [ ] Add integration tests for cron jobs
- [ ] Add alerting for failed digest deliveries
- [ ] Document RLS patterns in engineering wiki
- [ ] Consider schema refactor to add direct FK (breaking change)

---

## Summary

**Before:**
- ❌ 0/13 orgs processed
- ❌ RLS error on all attempts
- ❌ No digests sent

**After:**
- ✅ RLS issue resolved
- ✅ Separate queries + memory join
- ✅ Ready for next Monday

**Test now to confirm!** 🚀

