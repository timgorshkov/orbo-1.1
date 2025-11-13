# Community Hub Implementation Plan

## Priority: Community Hub First 🎯

Based on user feedback, we're prioritizing the Community Hub as the entry point for Telegram community members.

---

## ✅ What We Already Have

### 1. **Telegram Code Auth System** ✅
- ✅ 6-character hex codes (e.g., "A3F7B2")
- ✅ Table: `telegram_auth_codes`
- ✅ API: `/api/auth/telegram-code/generate`
- ✅ API: `/api/auth/telegram-code/verify`
- ✅ Bot command: `/start CODE`
- ✅ 10-minute expiration

### 2. **Events System** ✅
- ✅ Table: `events` with `is_public` column
- ✅ Public pages: `/p/[org]/events/[id]`
- ✅ Registration system
- ✅ RLS policies for public/members

### 3. **Apps System** ✅
- ✅ Basic CRUD
- ✅ Public pages: `/p/[org]/apps/[appId]`
- ✅ Dynamic schema (JSONB)
- ❌ **Missing: visibility column**

### 4. **Mobile Navigation** ✅
- ✅ `CollapsibleSidebar` for admin panel
- ✅ Responsive design patterns
- ❌ **Missing: public nav component**

---

## 📋 Implementation Tasks

### Phase 1: Foundation (Database + Visibility)

#### Task 1.1: Add Visibility to Apps
**Migration:** `105_apps_visibility.sql`

```sql
-- Add visibility column to apps
ALTER TABLE apps 
ADD COLUMN visibility TEXT 
CHECK (visibility IN ('public', 'members', 'private')) 
DEFAULT 'members';

-- Add index for filtering
CREATE INDEX idx_apps_visibility ON apps(visibility) WHERE status = 'published';

-- Add description fields to organizations
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS public_description TEXT,
ADD COLUMN IF NOT EXISTS telegram_group_link TEXT;
```

#### Task 1.2: Update RLS Policies
```sql
-- Drop existing SELECT policies (if any)
DROP POLICY IF EXISTS "Apps are viewable by org members" ON apps;

-- Public apps viewable by everyone
CREATE POLICY "Public apps viewable by everyone"
  ON apps FOR SELECT
  USING (
    status = 'published' 
    AND visibility = 'public'
  );

-- Members-only apps viewable by participants
CREATE POLICY "Members apps viewable by participants"
  ON apps FOR SELECT
  USING (
    status = 'published' 
    AND visibility = 'members'
    AND org_id IN (
      SELECT org_id FROM participants
      WHERE id = auth.uid()
    )
  );

-- Private apps viewable only by admins
CREATE POLICY "Private apps viewable by admins"
  ON apps FOR SELECT
  USING (
    visibility = 'private'
    AND org_id IN (
      SELECT org_id FROM memberships
      WHERE user_id = auth.uid()
    )
  );

-- Admins can always view their org's apps
CREATE POLICY "Admins can view all org apps"
  ON apps FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );
```

#### Task 1.3: Update App Items RLS
```sql
-- App items inherit visibility from parent app
CREATE POLICY "Items inherit app visibility"
  ON app_items FOR SELECT
  USING (
    app_id IN (
      SELECT id FROM apps
      WHERE 
        (status = 'published' AND visibility = 'public')
        OR (
          status = 'published' 
          AND visibility = 'members'
          AND org_id IN (
            SELECT org_id FROM participants
            WHERE id = auth.uid()
          )
        )
        OR org_id IN (
          SELECT org_id FROM memberships
          WHERE user_id = auth.uid()
        )
    )
  );
```

---

### Phase 2: API Updates

#### Task 2.1: Update GET /api/apps
**File:** `app/api/apps/route.ts`

Add visibility filtering based on auth status:
```typescript
// If not authenticated: only public
// If member: public + members
// If admin: all
```

#### Task 2.2: Create GET /api/organizations/[orgId]/public
**File:** `app/api/organizations/[orgId]/public/route.ts`

```typescript
// Returns:
// - Organization name, description, logo
// - Telegram group link
// - Top 3 upcoming events (public or members if auth)
// - Top 3 apps (public or members if auth)
```

---

### Phase 3: UI Components

#### Task 3.1: Visibility Selector Component
**File:** `components/apps/visibility-selector.tsx`

```tsx
<select value={visibility} onChange={...}>
  <option value="members">👥 Для участников (по умолчанию)</option>
  <option value="public">🌍 Публичное (доступно всем)</option>
  <option value="private">🔒 Приватное (только админы)</option>
</select>
```

#### Task 3.2: Visibility Badge Component
**File:** `components/apps/visibility-badge.tsx`

```tsx
{visibility === 'public' && <Badge>🌍 Публичное</Badge>}
{visibility === 'members' && <Badge>👥 Для участников</Badge>}
{visibility === 'private' && <Badge>🔒 Приватное</Badge>}
```

#### Task 3.3: Mobile-First Public Navigation
**File:** `components/navigation/public-nav.tsx`

Mobile-first design:
- Hamburger menu on mobile
- Horizontal nav on desktop
- Auth status indicator
- "Войти как участник" button

---

### Phase 4: Community Hub Page

#### Task 4.1: Create Community Hub
**File:** `app/p/[org]/page.tsx`

Sections:
1. **Hero**: Org name + description + CTA
2. **Upcoming Events** (3 cards): Link to /p/[org]/events
3. **Apps** (3 cards): Link to /p/[org]/apps
4. **Telegram CTA**: Join group button

#### Task 4.2: Events List Page
**File:** `app/p/[org]/events/page.tsx`

- List all public + (if auth) members-only events
- Filter by upcoming/past
- Search & category filters

#### Task 4.3: Fix Apps List Page
**File:** `app/p/[org]/apps/page.tsx`

Current issues:
- Shows "no apps" even if public apps exist
- No visibility filtering
- No empty state for unauthenticated users

Fixes:
- Respect visibility
- Show "Login to see more" banner if unauthenticated
- Empty state: "No apps yet" with CTA for admins

---

### Phase 5: Member Auth Flow

#### Task 5.1: Auth Page
**File:** `app/p/[org]/auth/page.tsx`

UI:
```
┌─────────────────────────────────────┐
│  Войти как участник                  │
│                                     │
│  Введите код из Telegram-бота:      │
│  [______]  [Войти]                  │
│                                     │
│  Нет кода?                          │
│  [Получить код в @orbo_community_bot]│
│                                     │
│  ───────────────────────────────── │
│  Администратор?                     │
│  [Войти через email →]              │
└─────────────────────────────────────┘
```

#### Task 5.2: Auth Flow Logic
1. User clicks "Войти"
2. Generate code via `/api/auth/telegram-code/generate`
3. Show code + bot link
4. User sends code to bot
5. Bot validates & stores telegram_user_id
6. Frontend polls `/api/auth/telegram-code/status?code=XXX`
7. When verified, create session & redirect

---

### Phase 6: Settings & Admin UX

#### Task 6.1: Add Visibility to App Form
**Files:**
- `app/(authenticated)/create-app/page.tsx` (AI Constructor)
- `app/app/[org]/apps/[appId]/edit/page.tsx` (Manual edit)

Add checkbox/selector for visibility with explanation.

#### Task 6.2: Organization Settings
**File:** `app/app/[org]/settings/page.tsx`

Add fields:
- **Public Description** (textarea, 500 chars)
- **Telegram Group Link** (URL)
- Preview button → opens `/p/[org]`

#### Task 6.3: AI Constructor Prompt Update
**File:** `lib/services/aiConstructorService.ts`

Add visibility question:
```
5. Видимость: "Кто сможет видеть это приложение?"
   - Все (публичное) - для сайтов-витрин
   - Участники (по умолчанию) - для сообщества
   - Только админы (приватное) - для внутренних инструментов
```

---

## 🎨 Design System

### Colors
- **Public (🌍)**: Blue (#3B82F6)
- **Members (👥)**: Green (#10B981)
- **Private (🔒)**: Gray (#6B7280)

### Typography
- **Hero Title**: 2xl, bold
- **Section Title**: xl, semibold
- **Card Title**: lg, medium
- **Body**: base, regular

### Spacing
- **Section Gap**: 12 (3rem)
- **Card Gap**: 6 (1.5rem)
- **Content Padding**: 4 (1rem mobile), 6 (1.5rem desktop)

---

## 📐 Page Layouts

### Community Hub (`/p/[org]`)
```
Mobile (< 768px):
┌─────────────┐
│ [≡] Название│
├─────────────┤
│ Hero        │
├─────────────┤
│ Events (1)  │
│ [card]      │
├─────────────┤
│ Apps (2)    │
│ [card]      │
│ [card]      │
├─────────────┤
│ Telegram CTA│
└─────────────┘

Desktop (≥ 768px):
┌──────────────────────────────────┐
│  [Logo] Название    [Войти]      │
├──────────────────────────────────┤
│         Hero Section             │
├──────────────────────────────────┤
│  События                          │
│  ┌─────┐ ┌─────┐ ┌─────┐        │
│  │ 1   │ │ 2   │ │ 3   │        │
│  └─────┘ └─────┘ └─────┘        │
├──────────────────────────────────┤
│  Приложения                       │
│  ┌─────┐ ┌─────┐ ┌─────┐        │
│  │ 1   │ │ 2   │ │ 3   │        │
│  └─────┘ └─────┘ └─────┘        │
└──────────────────────────────────┘
```

---

## 🧪 Testing Checklist

### Database
- [ ] Migration applies cleanly
- [ ] Default visibility = 'members'
- [ ] RLS policies work for all levels
- [ ] No performance regression

### API
- [ ] Public apps visible in incognito
- [ ] Members apps require auth
- [ ] Private apps only for admins
- [ ] Visibility filtering works

### UI
- [ ] Visibility selector in forms
- [ ] Badges display correctly
- [ ] Empty states show properly
- [ ] Mobile responsive

### Auth
- [ ] Code generation works
- [ ] Bot validates codes
- [ ] Session created after auth
- [ ] Redirect to original page

### Community Hub
- [ ] Shows correct content for auth level
- [ ] CTAs work (events, apps, telegram)
- [ ] Loads fast (< 2s)
- [ ] SEO metadata present

---

## 📊 Metrics to Track

### Engagement
- Community Hub visits
- Auth conversion rate (% who login)
- Public → Member conversion

### Content
- Apps by visibility (public/members/private split)
- Most viewed public apps
- Event registration from hub

### Technical
- Page load time (hub, events, apps)
- API response time
- Auth success rate

---

## 🚀 Rollout Plan

### Week 1: Foundation
**Days 1-2:**
- ✅ Database migration (visibility)
- ✅ RLS policies
- ✅ API updates

**Days 3-4:**
- ✅ Visibility UI (forms, badges)
- ✅ Fix `/p/[org]/apps` filtering

**Day 5:**
- ✅ Testing & fixes

### Week 2: Community Hub
**Days 1-2:**
- ✅ Create hub page structure
- ✅ Events preview component
- ✅ Apps preview component

**Days 3-4:**
- ✅ Mobile navigation
- ✅ Auth page
- ✅ Polish & responsive

**Day 5:**
- ✅ End-to-end testing
- ✅ Deploy to production

### Week 3: Settings & Polish
**Days 1-2:**
- ✅ Organization settings
- ✅ AI Constructor updates

**Days 3-5:**
- ✅ Documentation
- ✅ User feedback
- ✅ Iteration

---

## 🎯 Success Criteria

### Must Have (MVP)
- ✅ Community Hub page exists
- ✅ Shows top 3 events + apps
- ✅ Visibility works (public/members/private)
- ✅ Auth via Telegram code
- ✅ Mobile responsive

### Should Have
- ✅ Events list page
- ✅ Empty states
- ✅ Loading states
- ✅ Error handling

### Nice to Have
- ⏳ AI-generated org description
- ⏳ Advanced filtering
- ⏳ Search functionality
- ⏳ Analytics dashboard

---

## 📝 Questions Resolved

1. **Default visibility?** → `'members'` ✅
2. **Priority?** → Community Hub first ✅
3. **Auth code?** → Use existing 6-char system ✅
4. **Org description?** → Text field in settings (AI later) ✅
5. **Materials?** → Defer to Phase 2 ✅

---

**Ready to start implementation!** 🚀

**Starting with:** Database migration + RLS policies

