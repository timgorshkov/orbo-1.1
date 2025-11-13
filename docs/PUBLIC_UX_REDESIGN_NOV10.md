# Public UX Redesign - Community-First Approach

## Overview
Comprehensive redesign of public-facing pages with focus on community members (Telegram group participants) as primary users, not admins.

---

## 🎯 Core Principles

### 1. **Three Access Levels**
```
Public (anyone) → Members (Telegram participants) → Admins (email auth)
```

### 2. **Two Entry Points**
- **Community Hub** (`/p/[org]`) - public landing page
- **Admin Panel** (`/app/[org]`) - management interface (unchanged)

### 3. **Two Auth Flows**
- **"Войти как участник"** - Telegram code (via orbo_community_bot)
- **"Войти как админ"** - Email/password (current flow)

---

## 📐 URL Architecture

### Public Pages (Current + New)
```
/p/[org]                          → Community Hub (NEW) 🌟
/p/[org]/events                   → Public Events List (NEW)
/p/[org]/events/[id]              → Event Detail (EXISTS)
/p/[org]/apps                     → Public Apps List (EXISTS, needs fix)
/p/[org]/apps/[appId]             → App Feed (EXISTS)
/p/[org]/apps/[appId]/items/[id]  → Item Detail (EXISTS)
/p/[org]/materials                → Public Materials (FUTURE)
/p/[org]/auth                     → Member Auth Page (NEW)
```

### Admin Pages (Unchanged)
```
/app/[org]/*                      → All admin routes (unchanged)
```

---

## 🏠 Community Hub Page (`/p/[org]`)

### Purpose
Single landing page for community members to discover and access all content.

### Layout
```
┌─────────────────────────────────────────────────────────┐
│  [Logo] Название Сообщества          [Войти как участник] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  📝 О сообществе                                        │
│  [Краткое описание организации]                         │
│                                                         │
│  📅 Ближайшие события (3)         [Все события →]     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│  │ Event 1  │ │ Event 2  │ │ Event 3  │              │
│  └──────────┘ └──────────┘ └──────────┘              │
│                                                         │
│  📱 Приложения (3)                [Все приложения →]  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│  │  App 1   │ │  App 2   │ │  App 3   │              │
│  │ 🌍 Public│ │ 👥 Members│ │ 🌍 Public│              │
│  └──────────┘ └──────────┘ └──────────┘              │
│                                                         │
│  📚 Материалы                     [Все материалы →]   │
│  (Coming soon)                                          │
│                                                         │
│  ─────────────────────────────────────────────────── │
│  Присоединяйтесь к нашему сообществу в Telegram:     │
│  [Telegram Group Button]                               │
└─────────────────────────────────────────────────────────┘
```

### Features
- **No auth required** to view
- Shows only **public** + (for auth members) **members-only** content
- **Clear CTAs** for joining Telegram / logging in
- **Responsive** design (mobile-first)
- **SEO-friendly** (meta tags, OpenGraph)

---

## 🔒 Content Visibility Model

### For Apps (NEW COLUMN)

**Add `visibility` column to `apps` table:**
```sql
ALTER TABLE apps 
ADD COLUMN visibility TEXT 
CHECK (visibility IN ('public', 'members', 'private')) 
DEFAULT 'members';
```

**Visibility Levels:**
- **`public`** - Anyone can view (incognito, search engines)
- **`members`** - Only authenticated Telegram participants
- **`private`** - Only admins (dashboard only)

### For Events (ALREADY EXISTS)
- `is_public = true` → public
- `is_public = false` → members only

### For Materials (FUTURE)
- Same model as Apps

---

## 🚪 Two-Way Authentication

### 1. Member Auth (Telegram Code)
**Flow:**
```
1. User clicks "Войти как участник"
2. Redirect to /p/[org]/auth?type=member
3. Show:
   - Input field: "Введите код из бота"
   - Link: "Получить код в @orbo_community_bot"
   - Button: "Войти"
4. On submit:
   - POST /api/auth/telegram-code { code, org_id }
   - Backend validates code & creates session
   - Redirect back to original page
```

**Backend:**
- Temporary codes in Redis/DB (5 min TTL)
- Code format: `ORG-{orgId}-{random6digits}`
- Bot command: `/code` → generates & sends code

### 2. Admin Auth (Email)
**Flow:** (unchanged)
```
1. User clicks "Войти как админ"
2. Redirect to /login
3. Email/password or social auth
4. Redirect to /app/[org]
```

---

## 🧭 Unified Navigation

### Public Navigation (top menu)
```
┌────────────────────────────────────────────────────┐
│ [Logo] Сообщество    События  Приложения  Материалы │
│                                    [Войти как участник] │
└────────────────────────────────────────────────────┘
```

### Member Navigation (authenticated, not admin)
```
┌────────────────────────────────────────────────────┐
│ [Logo] Сообщество    События  Приложения  Материалы │
│                           [Avatar] Имя Участника ▼  │
│                           └─ Мои регистрации       │
│                           └─ Профиль               │
│                           └─ Выйти                 │
└────────────────────────────────────────────────────┘
```

### Admin Navigation (same as now)
```
┌────────────────────────────────────────────────────┐
│ [Orbo Logo]  Сообщество ▼  [Other admin menus...]  │
│              └─ Управление                         │
│              └─ Публичная страница                 │
└────────────────────────────────────────────────────┘
```

---

## 📱 App Visibility UX

### App List Page (`/p/[org]/apps`)

**Display logic:**
```typescript
// Not authenticated (incognito)
→ Show only apps with visibility='public'
→ Show "Войдите, чтобы увидеть больше приложений" banner

// Authenticated as member
→ Show apps with visibility='public' OR 'members'
→ Hide 'private' apps

// Authenticated as admin
→ Show all apps + admin toolbar
```

**App Card Badges:**
```
🌍 Публичное     - visibility='public'
👥 Для участников - visibility='members'
🔒 Приватное     - visibility='private' (admin only)
```

### App Detail Page (`/p/[org]/apps/[appId]`)

**Access control:**
```typescript
// Public app
→ Show to everyone

// Members-only app
→ Show auth modal if not logged in
→ Show content if authenticated as member/admin

// Private app
→ 404 for public/members
→ Show for admins only
```

---

## 🎫 Event Registration Flow

### For Public Events
```
1. User opens /p/[org]/events/[id]
2. Sees event details
3. Clicks "Зарегистрироваться"
4. If not authenticated:
   → Modal: "Войдите как участник, чтобы зарегистрироваться"
   → Button: "Войти через Telegram"
5. If authenticated:
   → Register immediately
   → Show confirmation + QR code
```

### For Members-Only Events
```
1. User opens /p/[org]/events/[id]
2. If not authenticated:
   → Show access denied message
   → Button: "Войти как участник"
3. If authenticated as member:
   → Show event details
   → Can register
```

---

## 🔐 RLS Policies Update

### Apps Table
```sql
-- Public apps are viewable by everyone
CREATE POLICY "Public apps are viewable by everyone"
  ON public.apps
  FOR SELECT
  USING (visibility = 'public' AND status = 'published');

-- Members can view members-only apps
CREATE POLICY "Members can view members-only apps"
  ON public.apps
  FOR SELECT
  USING (
    visibility = 'members' 
    AND status = 'published'
    AND org_id IN (
      SELECT org_id FROM public.participants
      WHERE id = auth.uid()
    )
  );

-- Admins can view all apps
CREATE POLICY "Admins can view all apps"
  ON public.apps
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.memberships
      WHERE user_id = auth.uid()
    )
  );
```

### App Items Table
```sql
-- Items inherit visibility from parent app
CREATE POLICY "Items inherit app visibility"
  ON public.app_items
  FOR SELECT
  USING (
    app_id IN (
      SELECT id FROM public.apps
      WHERE visibility = 'public'
      OR (
        visibility = 'members'
        AND org_id IN (
          SELECT org_id FROM public.participants
          WHERE id = auth.uid()
        )
      )
      OR org_id IN (
        SELECT org_id FROM public.memberships
        WHERE user_id = auth.uid()
      )
    )
  );
```

---

## 🚀 Implementation Plan

### Phase 1: Foundation (Week 1)
1. ✅ Add `visibility` column to `apps` table
2. ✅ Update RLS policies for apps
3. ✅ Add visibility UI in app creation/settings
4. ✅ Fix `/p/[org]/apps` to respect visibility
5. ✅ Add visibility badge to app cards

### Phase 2: Community Hub (Week 1-2)
1. ✅ Create `/p/[org]` landing page
2. ✅ Fetch and display:
   - Upcoming 3 events (public + members if auth)
   - Top 3 apps (public + members if auth)
3. ✅ Add organization description field
4. ✅ Add "Войти как участник" button

### Phase 3: Member Auth (Week 2)
1. ✅ Create `/p/[org]/auth` page
2. ✅ Implement Telegram code generation in bot
3. ✅ Create `/api/auth/telegram-code` endpoint
4. ✅ Store temporary codes in DB
5. ✅ Create session on successful auth

### Phase 4: Navigation & Polish (Week 2-3)
1. ✅ Add unified navigation component
2. ✅ Update all public pages with new nav
3. ✅ Add member profile dropdown
4. ✅ Add breadcrumbs everywhere
5. ✅ Mobile-responsive design

### Phase 5: Materials (Week 3-4)
1. Add materials visibility logic
2. Create `/p/[org]/materials` page
3. Integrate into Community Hub

---

## 📊 User Journey Examples

### Journey 1: Visitor → Member
```
1. Google search → /p/[org] (Community Hub)
2. Sees 3 public apps, 2 events
3. Clicks event → "Members only, please log in"
4. Clicks "Войти как участник"
5. Opens Telegram bot, sends /code
6. Enters code, authenticated
7. Returns to event, can register
8. Browses members-only apps
```

### Journey 2: Telegram Member → App User
```
1. Sees message in Telegram group: "Check out our classifieds!"
2. Clicks link → /p/[org]/apps/[appId]
3. Not logged in, sees "Login to post"
4. Clicks "Войти как участник"
5. Gets code from bot
6. Authenticated
7. Can post classifieds
8. Shares item link in group
```

### Journey 3: Admin Managing Content
```
1. Logs in via /login (email)
2. Dashboard /app/[org]
3. Creates new app, sets visibility='public'
4. Publishes
5. Clicks "Публичная страница" in nav
6. Opens /p/[org]/apps/[appId]
7. Sees admin toolbar + public view
8. Shares link with community
```

---

## 🎨 Design System

### Color Coding
- **Public content**: Blue (#3B82F6)
- **Members content**: Green (#10B981)
- **Private content**: Gray (#6B7280)

### CTAs
- **Primary**: "Войти как участник" (Telegram blue)
- **Secondary**: "Войти как админ" (Gray link)
- **Tertiary**: "Зарегистрироваться" (Green)

### Icons
- 🌍 Public
- 👥 Members
- 🔒 Private
- 📅 Events
- 📱 Apps
- 📚 Materials

---

## 🔧 Technical Details

### Database Migration
```sql
-- Add visibility to apps
ALTER TABLE apps 
ADD COLUMN visibility TEXT 
CHECK (visibility IN ('public', 'members', 'private')) 
DEFAULT 'members';

-- Add org description for Community Hub
ALTER TABLE organizations
ADD COLUMN public_description TEXT,
ADD COLUMN telegram_group_link TEXT;

-- Create table for Telegram auth codes
CREATE TABLE telegram_auth_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL,
  participant_id UUID, -- set after first use
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_telegram_auth_codes_code ON telegram_auth_codes(code);
CREATE INDEX idx_telegram_auth_codes_expires ON telegram_auth_codes(expires_at);
```

### API Endpoints (NEW)
```
GET  /api/organizations/[orgId]/public → Fetch org public info
POST /api/auth/telegram-code           → Validate & auth via code
GET  /api/auth/generate-code           → Generate code (bot only)
```

### Component Architecture
```
/components/
  community/
    community-hub.tsx           → Main hub page
    community-nav.tsx           → Unified navigation
    auth-modal.tsx              → Telegram code auth modal
    visibility-badge.tsx        → Public/Members/Private badge
  events/
    public-events-list.tsx      → Events list for hub
  apps/
    public-apps-list.tsx        → Apps list for hub
```

---

## 📈 Success Metrics

### Engagement
- **Community Hub visits** (unique visitors)
- **Member auth rate** (% visitors who authenticate)
- **Public → Member conversion** (within 7 days)

### Retention
- **7-day active members** (return visits)
- **Event registration rate** (members who register)
- **App usage rate** (members who post/interact)

### Viral Growth
- **Share link clicks** (from Telegram)
- **New signups from public pages** (attribution)
- **Organic search traffic** (SEO)

---

## 🎯 Key Decisions

### 1. **Default visibility = 'members'**
Why: Most communities want to reward participation, not everything should be public.

### 2. **Telegram-first auth**
Why: Aligns with core use case (Telegram communities). Email auth is admin-only.

### 3. **Single Community Hub**
Why: Reduces cognitive load. One entry point for all public content.

### 4. **No separate "public" vs "members" apps list**
Why: Show all accessible content in one place. Use badges to indicate visibility.

### 5. **Admin toolbar on public pages**
Why: Admins need context. Show public view + admin actions together.

---

## 🚨 Edge Cases & Solutions

### 1. Empty Community Hub
**Problem**: New org, no content yet  
**Solution**: Show onboarding prompt: "Создайте первое мероприятие или приложение"

### 2. Member without Telegram
**Problem**: User authenticated via email, not in Telegram group  
**Solution**: Show banner: "Присоединитесь к Telegram-группе для полного доступа"

### 3. Expired auth code
**Problem**: Code used after 5 min  
**Solution**: Show error + "Получить новый код" button

### 4. App switched from public → members
**Problem**: Public user has direct link  
**Solution**: Show auth modal: "Этот контент теперь только для участников"

### 5. Deleted participant, but auth session exists
**Problem**: User removed from Telegram group  
**Solution**: Check membership on each request, logout if not found

---

## ✅ Immediate Next Steps (Priority Order)

1. **Add visibility column to apps** (migration)
2. **Update RLS policies** (security)
3. **Fix `/p/[org]/apps` page** (show only accessible apps)
4. **Create Community Hub** (`/p/[org]`)
5. **Add visibility UI** (app settings)
6. **Implement Telegram code auth** (member login)
7. **Add unified navigation** (all pages)
8. **Mobile optimization** (responsive design)

---

## 📝 Notes

- This design prioritizes **community members** as primary users
- **Admins** have separate dashboard (`/app/[org]`)
- **Public pages** are SEO-friendly and shareable
- **Telegram integration** is core to auth and growth
- **Gradual rollout** possible (can start with visibility only)

---

**Ready to implement?** 🚀

