# Channel Removal Implementation

## 🎯 Overview

Implements safe channel removal from organization following the same pattern as group removal.

### Key Principles:
- ✅ Remove only the **organization-channel link** (`org_telegram_channels`)
- ❌ DO NOT delete channel itself (`telegram_channels`)
- ❌ DO NOT delete channel data (posts, subscribers, events)
- ✅ Allow re-adding with full history intact

---

## 📊 Architecture

### Database Structure:

```
org_telegram_channels (org ↔ channel link) ← DELETE THIS
  ↓
telegram_channels (channel record) ← KEEP
  ├── channel_posts (ON DELETE CASCADE) ← KEEP
  ├── channel_subscribers (ON DELETE CASCADE) ← KEEP
  │     └── participant_id (ON DELETE SET NULL) ← KEEP
  └── activity_events (channel_comment) ← KEEP
```

### Foreign Keys:

```sql
org_telegram_channels:
  - channel_id → telegram_channels(id) ON DELETE CASCADE
  - org_id → organizations(id) ON DELETE CASCADE
  - created_by → profiles(id) ON DELETE SET NULL

channel_posts:
  - channel_id → telegram_channels(id) ON DELETE CASCADE

channel_subscribers:
  - channel_id → telegram_channels(id) ON DELETE CASCADE
  - participant_id → participants(id) ON DELETE SET NULL
```

---

## 🔒 Edge Cases Handled

### 1. Channel Used by Multiple Organizations
**Scenario:** Channel is linked to multiple orgs  
**Behavior:**
- Remove only link for current org
- Other orgs continue to access channel
- Channel data remains intact
- Check performed: `SELECT COUNT(*) FROM org_telegram_channels WHERE channel_id = ?`

### 2. Data Preservation
**What remains after removal:**
- ✅ `telegram_channels` record
- ✅ All `channel_posts` (history)
- ✅ All `channel_subscribers` (audience data)
- ✅ All `activity_events` (analytics history)
- ✅ `participants` records (may be linked from other sources)

### 3. Re-adding Channel
**Scenario:** Admin re-adds previously removed channel  
**Behavior:**
- Same `telegram_channels` record reused
- All historical data immediately available
- New `org_telegram_channels` link created
- Webhook processing resumes for this org

### 4. RLS (Row-Level Security)
**Policies affected:**
- `channel_posts.posts_select`: checks `user_has_channel_access(channel_id)`
- `channel_subscribers.subscribers_select`: checks `user_has_channel_access(channel_id)`

**After removal:**
- Org members lose SELECT access to channel data
- Data still exists, just not accessible
- Access restored if channel re-added

### 5. Webhook Processing
**Scenario:** Webhook receives channel updates after removal  
**Behavior:**
- Bot continues to receive updates (still in Telegram channel)
- Webhook checks `org_telegram_channels` for org linkage
- No org link = no processing for that org
- Other orgs with link continue processing

### 6. Subscriber-Participant Links
**Scenario:** `channel_subscribers.participant_id` links to `participants`  
**Behavior:**
- Participants remain in org (may be from other sources)
- Subscriber record remains (linked to channel, not org)
- Link preserved via `participant_id` (ON DELETE SET NULL)
- If participant deleted, subscriber remains but participant_id → NULL

### 7. Discussion Group
**Scenario:** Channel has linked discussion group  
**Behavior:**
- Discussion group link (`linked_chat_id`) remains in `telegram_channels`
- If discussion group is also in org, it continues separately
- No cascade effect between channel and discussion group

---

## 🛠️ Implementation

### 1. API Endpoint

**File:** `app/api/telegram/channels/[channelId]/remove/route.ts`

```typescript
DELETE /api/telegram/channels/[channelId]/remove?orgId=xxx

Response:
{
  "success": true,
  "message": "Channel removed from organization",
  "channelId": "uuid",
  "usedByOtherOrgs": boolean
}
```

**Security:**
- Requires authentication
- Requires admin or owner role
- Checks channel exists
- Checks org-channel link exists
- Logs admin action

**Steps:**
1. Verify user is admin/owner
2. Verify channel exists
3. Verify org-channel link exists
4. Delete link from `org_telegram_channels`
5. Log admin action
6. Check if used by other orgs
7. Return success with metadata

### 2. UI Component

**File:** `components/telegram-channel-actions.tsx`

**Component:** `RemoveChannelButton`

**Props:**
- `channelId: string` - Channel UUID
- `channelTitle: string` - Channel name for confirmation
- `orgId: string` - Organization ID
- `onRemoved?: () => void` - Callback after removal

**Features:**
- Confirmation dialog with detailed explanation
- Loading state during removal
- Error display
- Auto-refresh after removal
- Redirect to channels list

**Confirmation Message:**
```
Вы уверены, что хотите удалить канал "{title}" из организации?

Это действие НЕ удалит:
• Канал из Telegram
• Историю постов
• Подписчиков канала
• События активности

Вы сможете добавить канал заново, и вся история восстановится.
```

### 3. Integration with Channels Page

**File:** `app/p/[org]/telegram/channels/page.tsx`

**Add import:**
```typescript
import { RemoveChannelButton } from '@/components/telegram-channel-actions'
```

**Add button to channel list:**
```tsx
{channelList.map((channel) => (
  <Card key={channel.id}>
    {/* ... channel info ... */}
    <div className="flex gap-2">
      <Link href={`/p/${orgId}/telegram/channels/${channel.id}`}>
        <Button>Статистика</Button>
      </Link>
      <RemoveChannelButton
        channelId={channel.id}
        channelTitle={channel.title}
        orgId={orgId}
      />
    </div>
  </Card>
))}
```

---

## 🧪 Testing Checklist

### Before Removal:
- [ ] Channel visible in org's channel list
- [ ] Channel stats accessible
- [ ] Posts visible to org members
- [ ] Subscribers visible to org members
- [ ] Activity events logged

### Removal Process:
- [ ] Only admin/owner can access remove button
- [ ] Confirmation dialog appears with correct info
- [ ] API call succeeds
- [ ] Admin action logged
- [ ] Page refreshes automatically

### After Removal:
- [ ] Channel NOT visible in org's channel list
- [ ] Channel stats NOT accessible to org members
- [ ] Posts NOT visible to org members (RLS blocks)
- [ ] Subscribers NOT visible to org members (RLS blocks)
- [ ] Activity events still exist in database
- [ ] Channel record still exists in `telegram_channels`
- [ ] All data intact (posts, subscribers)

### Re-adding:
- [ ] Channel can be added again via "Add Channel" dialog
- [ ] Same channel record reused (same UUID)
- [ ] All historical data immediately visible
- [ ] Stats show full history (before + after removal)
- [ ] Webhook processing resumes

### Multi-Org:
- [ ] Remove from Org A, Org B still has access
- [ ] Webhook processes for Org B but not Org A
- [ ] Remove from Org B, channel fully orphaned
- [ ] Can re-add to Org A with full history

---

## 📋 SQL Verification Queries

### Check org-channel links:
```sql
SELECT 
  otc.org_id,
  o.name as org_name,
  tc.title as channel_title,
  tc.tg_chat_id
FROM org_telegram_channels otc
JOIN organizations o ON o.id = otc.org_id
JOIN telegram_channels tc ON tc.id = otc.channel_id
WHERE tc.id = 'CHANNEL_UUID';
```

### Check data preservation:
```sql
-- Posts count
SELECT COUNT(*) FROM channel_posts WHERE channel_id = 'CHANNEL_UUID';

-- Subscribers count
SELECT COUNT(*) FROM channel_subscribers WHERE channel_id = 'CHANNEL_UUID';

-- Activity events count
SELECT COUNT(*) FROM activity_events WHERE event_type = 'channel_comment' AND meta->>'channel_id' = 'TG_CHAT_ID';
```

### Check RLS access:
```sql
-- As org member (should return 0 after removal)
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims.sub = 'USER_UUID';
SELECT COUNT(*) FROM channel_posts WHERE channel_id = 'CHANNEL_UUID';
```

---

## ⚠️ Important Notes

1. **Admin Action Logging:**
   - Uses existing `AdminActions.REMOVE_TELEGRAM_GROUP` action
   - Stores in `admin_actions` table
   - Includes channel title and tg_chat_id in metadata

2. **RLS Impact:**
   - Removal immediately blocks org members' access
   - Backend queries with service role still work
   - Re-adding restores access instantly

3. **Webhook Behavior:**
   - Bot stays in channel (not kicked)
   - Continues receiving updates
   - Org linkage check prevents processing
   - No cleanup needed

4. **Data Retention:**
   - All data kept indefinitely
   - No automated cleanup
   - Manual cleanup requires admin action
   - Useful for analytics and re-activation

5. **Performance:**
   - Single DELETE query
   - No cascading deletes on data tables
   - Instant operation
   - No webhook impact

---

## 🚀 Deployment Steps

1. **Deploy API endpoint:**
   ```bash
   git add app/api/telegram/channels/[channelId]/remove/route.ts
   git commit -m "feat: add channel removal API endpoint"
   ```

2. **Deploy UI component:**
   ```bash
   git add components/telegram-channel-actions.tsx
   git commit -m "feat: add RemoveChannelButton component"
   ```

3. **Integrate with channels page:**
   - Add import for `RemoveChannelButton`
   - Add button to channel list rendering
   - Test locally first

4. **Test on staging:**
   - Test removal as admin
   - Test re-adding
   - Verify data preservation
   - Check RLS behavior

5. **Deploy to production:**
   ```bash
   git push origin master
   ```

6. **Monitor:**
   - Check logs for `admin_actions` entries
   - Verify no errors in webhook processing
   - Confirm user feedback

---

## 📚 Related Files

- `app/api/telegram/groups/remove/route.ts` - Group removal (reference)
- `components/telegram-group-actions.tsx` - Group actions (reference)
- `db/migrations/202_telegram_channels.sql` - Channel schema
- `app/api/telegram/webhook/route.ts` - Webhook handler
- `lib/services/adminActionsService.ts` - Admin logging

---

## ✅ Summary

**What it does:**
- Safely removes channel from organization
- Preserves all historical data
- Allows re-adding with full history
- Follows established group removal pattern

**What it doesn't do:**
- Delete channel from Telegram
- Delete any channel data (posts, subscribers, events)
- Kick bot from channel
- Affect other organizations using the channel

**Edge cases covered:**
- Multi-org usage ✅
- Data preservation ✅
- Re-adding ✅
- RLS access control ✅
- Webhook processing ✅
- Subscriber-participant links ✅
- Discussion group ✅
