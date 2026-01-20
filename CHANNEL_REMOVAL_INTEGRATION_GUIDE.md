# Channel Removal - Integration Guide

## 🎯 Quick Integration

### Step 1: Add Component Import

In `app/p/[org]/telegram/channels/page.tsx`, add import at the top:

```typescript
import { RemoveChannelButton } from '@/components/telegram-channel-actions'
```

### Step 2: Find Channel Rendering Section

Look for the code that renders individual channels in the list. It should look something like:

```tsx
{channelList.map((channel) => (
  <Card key={channel.id}>
    <CardHeader>
      <CardTitle>{channel.title}</CardTitle>
    </CardHeader>
    <CardContent>
      {/* Channel info and stats */}
      
      <div className="flex gap-2 mt-4">
        <Link href={`/p/${orgId}/telegram/channels/${channel.id}`}>
          <Button>Статистика</Button>
        </Link>
        
        {/* ADD REMOVE BUTTON HERE */}
      </div>
    </CardContent>
  </Card>
))}
```

### Step 3: Add RemoveChannelButton

Add the button component after the "Статистика" button:

```tsx
<div className="flex gap-2 mt-4">
  <Link href={`/p/${orgId}/telegram/channels/${channel.id}`}>
    <Button>Статистика</Button>
  </Link>
  
  {/* NEW: Remove button */}
  <RemoveChannelButton
    channelId={channel.id}
    channelTitle={channel.title}
    orgId={orgId}
  />
</div>
```

---

## 📍 Exact Location

The button should be added where individual channels are rendered in the list. Look for:

1. **Channel Cards Section** - Usually after line ~130
2. **Action Buttons Area** - Where "Статистика" link/button is
3. **Inside `channelList.map()`** - Within the Card component

---

## 🎨 Styling Options

### Option A: Inline with Stats Button (Recommended)
```tsx
<div className="flex gap-2 justify-end mt-4">
  <Link href={`/p/${orgId}/telegram/channels/${channel.id}`}>
    <Button variant="default">Статистика</Button>
  </Link>
  <RemoveChannelButton
    channelId={channel.id}
    channelTitle={channel.title}
    orgId={orgId}
  />
</div>
```

### Option B: Separate Row
```tsx
<div className="space-y-2 mt-4">
  <Link href={`/p/${orgId}/telegram/channels/${channel.id}`} className="block">
    <Button variant="default" className="w-full">Статистика</Button>
  </Link>
  <RemoveChannelButton
    channelId={channel.id}
    channelTitle={channel.title}
    orgId={orgId}
  />
</div>
```

### Option C: Dropdown Menu (Advanced)
```tsx
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { MoreVertical } from 'lucide-react'

<div className="flex justify-between items-center">
  <Link href={`/p/${orgId}/telegram/channels/${channel.id}`}>
    <Button>Статистика</Button>
  </Link>
  
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon">
        <MoreVertical className="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem asChild>
        <RemoveChannelButton
          channelId={channel.id}
          channelTitle={channel.title}
          orgId={orgId}
        />
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</div>
```

---

## ✅ Verification

After integration, verify:

1. **Button appears** for each channel in the list
2. **Button is red-themed** (text-red-600, border-red-200)
3. **Trash icon** is visible
4. **Confirmation dialog** appears on click
5. **Page refreshes** after removal
6. **Channel disappears** from list

---

## 🚫 Common Issues

### Issue: Button not appearing
**Solution:** Check import path is correct: `@/components/telegram-channel-actions`

### Issue: TypeScript errors
**Solution:** Ensure `channel` object has `id` and `title` properties

### Issue: Permission denied
**Solution:** Verify API endpoint checks for admin/owner role

### Issue: Page not refreshing
**Solution:** Component includes `router.refresh()` and redirect logic

---

## 📝 Example: Full Integration

```tsx
import { RemoveChannelButton } from '@/components/telegram-channel-actions'

// ... inside component

{channelList.length > 0 ? (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {channelList.map((channel) => (
      <Card key={channel.id}>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>{channel.title}</CardTitle>
              <p className="text-sm text-neutral-500">@{channel.username}</p>
            </div>
            {channel.bot_status === 'connected' && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                Подключен
              </span>
            )}
          </div>
        </CardHeader>
        
        <CardContent>
          <div className="space-y-3">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-neutral-500">Подписчиков</p>
                <p className="font-semibold">{channel.subscriber_count?.toLocaleString() || 0}</p>
              </div>
              <div>
                <p className="text-neutral-500">Постов</p>
                <p className="font-semibold">{channel.posts_count || 0}</p>
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Link href={`/p/${orgId}/telegram/channels/${channel.id}`} className="flex-1">
                <Button variant="default" className="w-full">
                  Статистика
                </Button>
              </Link>
              <RemoveChannelButton
                channelId={channel.id}
                channelTitle={channel.title}
                orgId={orgId}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    ))}
  </div>
) : (
  <Card>
    <CardContent className="py-10 text-center">
      <p className="text-neutral-500">Нет подключенных каналов</p>
      <AddChannelDialog orgId={orgId} />
    </CardContent>
  </Card>
)}
```

---

## 🧪 Testing Steps

1. **Open channels page:** `/p/{orgId}/telegram/channels`
2. **Verify button appears** for each channel
3. **Click remove button**
4. **Read confirmation dialog** - ensure message is clear
5. **Confirm removal**
6. **Wait for redirect** - should go back to channels list
7. **Verify channel is gone** from list
8. **Check database** - verify only `org_telegram_channels` link deleted
9. **Try re-adding** - should work with full history

---

## 📞 Need Help?

If you encounter issues:

1. Check browser console for errors
2. Check server logs for API errors
3. Verify database permissions
4. Review `CHANNEL_REMOVAL_IMPLEMENTATION.md` for architecture details

---

## ✨ Done!

Your channel removal feature is now integrated. Users can safely remove channels from their organization while preserving all historical data.
