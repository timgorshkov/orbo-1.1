# Channel Subscribers Implementation Plan

## 🎯 Goal
Load and track channel subscribers through:
1. Discussion group comments (already working for some users)
2. Bulk import from discussion group
3. Activity tracking (reactions, comments)

---

## 📊 Current State Analysis

### What we have:
- ✅ Telegram channels integrated
- ✅ Channel posts saved to `channel_posts`
- ✅ Reactions counted (`message_reaction_count`)
- ✅ Discussion group linked (`linked_chat_id`)
- ✅ Activity tracking via `activity_events`

### What's missing:
- ❌ Not all discussion group users become participants
- ❌ No bulk import from discussion group
- ❌ No `channel_subscribers` table link to `participants`
- ❌ Channel activity not tracked separately

---

## 🚀 Implementation Plan

### Phase 1: Fix Participant Creation (CRITICAL)
**Status:** In Progress - Debugging

**Issue:** Only 1 of 3 users created from discussion group messages
- User 777000 (Telegram service) ✅
- User 5484900079 (Тимур) ✅
- User 1087968824 ❌
- User 136817688 ❌

**Solution:**
1. Added detailed logging to webhook handler
2. Test with new message → check logs
3. Fix `eventProcessingService.processUpdate()` if needed

---

### Phase 2: Bulk Import from Discussion Group
**Goal:** Import all discussion group members as channel subscribers

**Implementation:**

#### 1. Create API endpoint: `/api/telegram/channels/[channelId]/import-subscribers`

```typescript
POST /api/telegram/channels/[channelId]/import-subscribers
{
  "source": "discussion_group" // or "manual"
}

Response:
{
  "imported": 42,
  "skipped": 5,
  "errors": 1,
  "details": [...]
}
```

#### 2. Logic:
```typescript
// 1. Get discussion group ID from channel
const channel = await getChannel(channelId);
const discussionGroupId = channel.linked_chat_id;

// 2. Get all members from discussion group using getChatAdministrators
const members = await telegramService.getChatAdministrators(discussionGroupId);

// 3. Create participants for each member
for (const member of members) {
  await upsertParticipant({
    org_id,
    tg_user_id: member.user.id,
    first_name: member.user.first_name,
    last_name: member.user.last_name,
    username: member.user.username,
    source: 'channel_discussion_import'
  });
  
  // 4. Link to channel_subscribers
  await upsertChannelSubscriber({
    channel_id: channelId,
    tg_user_id: member.user.id,
    source: 'discussion_group_import'
  });
}
```

---

### Phase 3: Activity Tracking for Channels

#### 1. Channel Comments (from discussion group)
When message is posted in discussion group:

```typescript
// In webhook handler:
if (body.message && isCommentOnChannelPost(body.message)) {
  // Create activity_event
  await createActivityEvent({
    org_id,
    tg_user_id: body.message.from.id,
    tg_chat_id: body.message.chat.id,
    event_type: 'channel_comment',
    metadata: {
      channel_id: linkedChannelId,
      post_id: referencedPostId,
      message_id: body.message.message_id
    }
  });
  
  // Update channel_subscribers stats
  await incrementChannelSubscriberComments(channelId, userId);
}
```

#### 2. Channel Post Views (limited data)
Telegram sends `views` count in `channel_post` update:

```typescript
// Already implemented in processChannelPost
// Save to channel_posts.views_count
```

#### 3. Reactions (aggregated only)
`message_reaction_count` provides total counts, not individual users:

```typescript
// Already implemented
// Save to channel_posts.reactions_count
```

---

### Phase 4: Link channel_subscribers with participants

#### Update schema:
```sql
-- Add participant_id to channel_subscribers (optional, for direct link)
ALTER TABLE channel_subscribers 
ADD COLUMN participant_id UUID REFERENCES participants(id);

-- Create index
CREATE INDEX idx_channel_subscribers_participant 
ON channel_subscribers(participant_id);

-- Update existing records
UPDATE channel_subscribers cs
SET participant_id = p.id
FROM participants p
WHERE cs.tg_user_id = p.tg_user_id
  AND p.org_id = (
    SELECT org_id FROM org_telegram_channels otc
    WHERE otc.channel_id = cs.channel_id
    LIMIT 1
  );
```

---

## 📋 Database Changes Required

### 1. Add `source` to participants table
```sql
ALTER TABLE participants 
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'webhook_join';

ALTER TABLE participants
ADD CONSTRAINT participants_source_check
CHECK (source IN ('webhook_join', 'import', 'manual', 'channel_discussion_import', 'deep_link'));
```

### 2. Add `participant_id` to channel_subscribers
```sql
ALTER TABLE channel_subscribers 
ADD COLUMN IF NOT EXISTS participant_id UUID REFERENCES participants(id);

CREATE INDEX IF NOT EXISTS idx_channel_subscribers_participant 
ON channel_subscribers(participant_id);
```

### 3. Update RPC functions
```sql
-- Function to sync channel_subscribers with participants
CREATE OR REPLACE FUNCTION sync_channel_subscribers_with_participants()
RETURNS void AS $$
BEGIN
  UPDATE channel_subscribers cs
  SET participant_id = p.id
  FROM participants p
  JOIN org_telegram_channels otc ON otc.channel_id = cs.channel_id
  WHERE cs.tg_user_id = p.tg_user_id
    AND p.org_id = otc.org_id
    AND cs.participant_id IS NULL;
END;
$$ LANGUAGE plpgsql;
```

---

## 🎯 Next Steps (After Debugging)

1. ✅ Test with new message in discussion group
2. ✅ Fix participant creation if needed
3. 🔄 Implement bulk import endpoint
4. 🔄 Add activity tracking for channel comments
5. 🔄 Link channel_subscribers with participants
6. 🔄 Update UI to show subscriber stats

---

## 🧪 Testing Plan

### Test 1: Discussion Group Message
1. Post new comment in discussion group
2. Check logs for detailed processing info
3. Verify participant created in `participants` table
4. Verify activity in `activity_events`

### Test 2: Bulk Import
1. Call import endpoint for test channel
2. Verify all discussion group members imported
3. Check `channel_subscribers` table populated
4. Verify stats updated

### Test 3: Activity Tracking
1. Post comment → check activity_events
2. Put reaction on channel post → check channel_posts.reactions_count
3. Verify subscriber stats updated

---

## 📊 Success Metrics

- ✅ 100% of discussion group commenters become participants
- ✅ Bulk import successfully loads existing members
- ✅ Comments tracked in activity_events with type 'channel_comment'
- ✅ channel_subscribers linked to participants
- ✅ UI shows accurate subscriber counts

---

## ⚠️ Limitations (Telegram API)

1. **No direct subscriber list**
   - Can only get users who interact (comment, react in groups)
   - Channel subscriber list is private

2. **Anonymous reactions in channels**
   - `message_reaction_count` provides totals only
   - Individual user reactions not available in channels

3. **Views count**
   - Available per post, not per user
   - Can't track which specific user viewed

4. **Solution:**
   - Focus on discussion group as proxy for engaged subscribers
   - Track comments and discussion group reactions
   - Use bulk import to seed initial subscriber list
