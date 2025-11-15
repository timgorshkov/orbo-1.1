# 🏠 Week 1-2: Главная страница для участников
**Даты:** 15-28 ноября 2025  
**Effort:** 6-8 дней  
**Цель:** Участник открывает `/p/[org]` и сразу видит ценность

---

## 📐 АРХИТЕКТУРА

### Страницы:
- `app/p/[org]/page.tsx` - Главная страница (Server Component)

### API Endpoints:
- `GET /api/organizations/[orgId]/home` - Данные для главной страницы
- `GET /api/participants/me?orgId=X` - Текущий участник + stats
- `GET /api/participants?orgId=X&limit=5&sort=recent` - Новые участники
- `GET /api/events?orgId=X&status=upcoming&limit=3` - Ближайшие события
- `GET /api/events/my-registrations?orgId=X` - Мои регистрации

### Компоненты:
```
app/p/[org]/page.tsx
├── components/home/hero-section.tsx
├── components/home/upcoming-events-section.tsx
├── components/home/quick-links-section.tsx
├── components/home/recent-members-section.tsx
├── components/home/my-events-section.tsx (if registered)
├── components/home/welcome-newcomer.tsx (if < 7 days)
└── components/home/what-you-missed.tsx (if inactive > 14 days)
```

---

## 🗓️ DAY-BY-DAY PLAN

### **DAY 1 (Nov 18, Monday): Foundation + API**

#### Morning (2 hours):
**Task 1.1: Database queries для главной страницы**
- [ ] Создать функцию `getHomePageData(orgId, userId)` в `lib/server/getHomePageData.ts`
- [ ] Query 1: Organization info
- [ ] Query 2: Participant stats (days in community, events attended)
- [ ] Query 3: Upcoming events (3 ближайших)
- [ ] Query 4: Recent members (5 последних)
- [ ] Query 5: My event registrations (если есть)

**Task 1.2: API endpoint**
- [ ] Создать `app/api/organizations/[orgId]/home/route.ts`
- [ ] Вернуть JSON с данными для главной
- [ ] Обработать ошибки (org not found, unauthorized)
- [ ] Тест: `curl http://localhost:3000/api/organizations/{orgId}/home`

#### Afternoon (2 hours):
**Task 1.3: Main page structure**
- [ ] Создать `app/p/[org]/page.tsx`
- [ ] Server Component: fetch data на сервере
- [ ] Auth check: redirect to `/p/[org]/auth` if not authenticated
- [ ] Layout: max-width container, padding
- [ ] Loading state (Suspense boundary)

**Checklist Day 1:**
- [ ] `lib/server/getHomePageData.ts` создан
- [ ] API endpoint `/api/organizations/[orgId]/home` работает
- [ ] `app/p/[org]/page.tsx` рендерит базовую структуру
- [ ] Auth redirect работает
- [ ] Deploy на staging, smoke test

---

### **DAY 2 (Nov 19, Tuesday): Hero + Upcoming Events**

#### Morning (2 hours):
**Task 2.1: Hero Section**
- [ ] Создать `components/home/hero-section.tsx`
- [ ] Props: `{ orgName, orgLogo, orgDescription, memberCount }`
- [ ] Layout:
  ```
  [Logo] [Org Name]
  [Description]
  [X участников · X событий · X материалов]
  ```
- [ ] Responsive: mobile stack, desktop side-by-side
- [ ] Gradient background (subtle)

**Task 2.2: Upcoming Events Section**
- [ ] Создать `components/home/upcoming-events-section.tsx`
- [ ] Props: `{ events: Event[], orgId: string }`
- [ ] Layout: 3 карточки событий в ряд (mobile: 1 карточка)
- [ ] Event card:
  ```
  [Cover Image]
  [Title]
  [Date + Time]
  [Location]
  [N зарегистрировались]
  [Зарегистрироваться] button
  ```
- [ ] Click → `/p/[org]/events/[id]`
- [ ] "Все события" link → `/p/[org]/events`

#### Afternoon (2 hours):
**Task 2.3: Integration**
- [ ] Добавить Hero + Upcoming Events в `app/p/[org]/page.tsx`
- [ ] Styling: consistent spacing, colors
- [ ] Empty state: "Пока нет предстоящих событий"
- [ ] Loading skeleton для событий

**Checklist Day 2:**
- [ ] Hero section рендерится с реальными данными
- [ ] Upcoming Events показывает 3 события
- [ ] Кнопки регистрации работают
- [ ] Responsive на mobile
- [ ] Deploy staging, тест на мобильном

---

### **DAY 3 (Nov 20, Wednesday): Quick Links + Recent Members**

#### Morning (2 hours):
**Task 3.1: Quick Links Section**
- [ ] Создать `components/home/quick-links-section.tsx`
- [ ] Props: `{ orgId: string, isAdmin: boolean }`
- [ ] Layout: 4 карточки в ряд (mobile: 2x2)
- [ ] Links:
  1. **Мой профиль** → `/p/[org]/profile`
  2. **Все события** → `/p/[org]/events`
  3. **Материалы** → `/p/[org]/materials`
  4. **Telegram группы** → `/p/[org]/telegram` (если в группе)
- [ ] Icon + Title для каждой карточки
- [ ] Hover effect (scale, shadow)

**Task 3.2: Recent Members Section**
- [ ] Создать `components/home/recent-members-section.tsx`
- [ ] Props: `{ members: Participant[], orgId: string }`
- [ ] Layout: горизонтальный скролл с аватарами
- [ ] Member card:
  ```
  [Avatar (круглое фото)]
  [Full Name]
  [Username @]
  ```
- [ ] Click → `/p/[org]/members/[id]`
- [ ] "Все участники" link → `/p/[org]/members`

#### Afternoon (2 hours):
**Task 3.3: Integration + Polish**
- [ ] Добавить Quick Links + Recent Members в main page
- [ ] Section titles: "Быстрые ссылки", "Новые участники"
- [ ] Spacing между секциями (consistent 48px gap)
- [ ] Avatar fallback (initials если нет фото)

**Checklist Day 3:**
- [ ] Quick Links работают, ведут на правильные страницы
- [ ] Recent Members показывает 5 последних
- [ ] Horizontal scroll работает на mobile
- [ ] Avatar fallback работает
- [ ] Deploy staging

---

### **DAY 4 (Nov 21, Thursday): Персонализация - Welcome Block**

#### Morning (2 hours):
**Task 4.1: Calculate participant stats**
- [ ] Добавить в `getHomePageData`:
  - `daysInCommunity` (today - joined_at)
  - `eventsAttended` (count registrations)
  - `lastActiveAt` (last message/action)
  - `isNewcomer` (< 7 days)
  - `isInactive` (> 14 days no activity)

**Task 4.2: Welcome Newcomer Component**
- [ ] Создать `components/home/welcome-newcomer.tsx`
- [ ] Props: `{ participantName, daysInCommunity, orgName }`
- [ ] Layout:
  ```
  🎉 Добро пожаловать, {Name}!
  Ты в сообществе "{OrgName}" уже {N} дней
  
  [Начни с этого:]
  → Изучи материалы
  → Зарегистрируйся на событие
  → Представься в Telegram-группе
  ```
- [ ] Gradient background (welcome vibe)
- [ ] Dismissible (localStorage: hide after 3 views)

#### Afternoon (2 hours):
**Task 4.3: My Events Section**
- [ ] Создать `components/home/my-events-section.tsx`
- [ ] Props: `{ registrations: EventRegistration[], orgId }`
- [ ] Show only if user has registrations
- [ ] Layout: список событий с датами
- [ ] Badge: "Сегодня!" / "Завтра" / "Через X дней"
- [ ] "Отменить регистрацию" button (confirm dialog)

**Checklist Day 4:**
- [ ] Welcome block показывается новичкам (< 7 days)
- [ ] My Events показывает мои регистрации
- [ ] Badge "Сегодня" работает корректно
- [ ] Dismissible welcome работает
- [ ] Deploy staging

---

### **DAY 5 (Nov 22, Friday): Персонализация - What You Missed**

#### Morning (2 hours):
**Task 5.1: What You Missed Component**
- [ ] Создать `components/home/what-you-missed.tsx`
- [ ] Props: `{ lastActiveAt, recentEvents, recentMembers, recentMaterials }`
- [ ] Show only if inactive > 14 days
- [ ] Layout:
  ```
  ⏰ С твоего последнего визита ({date})
  
  → X новых событий (показать 2-3)
  → X новых участников (показать 3-5)
  → X новых материалов (показать 2-3)
  
  [Посмотреть всё новое]
  ```
- [ ] Links к каждому разделу

**Task 5.2: Activity reminder logic**
- [ ] Helper: `getActivitySummary(orgId, userId, since)`
- [ ] Fetch:
  - New events (created_at > lastActiveAt)
  - New members (joined_at > lastActiveAt)
  - New materials (created_at > lastActiveAt)
- [ ] Cache result (60 min TTL)

#### Afternoon (2 hours):
**Task 5.3: Integration + Final touches**
- [ ] Добавить What You Missed в main page (conditional)
- [ ] Order sections:
  1. Welcome Newcomer (if < 7 days)
  2. What You Missed (if inactive > 14 days)
  3. Hero
  4. My Events (if has registrations)
  5. Upcoming Events
  6. Quick Links
  7. Recent Members
- [ ] Consistent spacing
- [ ] Final styling pass

**Checklist Day 5:**
- [ ] What You Missed показывается неактивным
- [ ] Activity summary считается корректно
- [ ] Section order логичный
- [ ] All responsive на mobile
- [ ] Deploy staging

---

### **DAY 6 (Nov 23-24, Weekend): Polish + Testing**

#### Task 6.1: UI/UX Polish (3 hours)
- [ ] **Loading states:**
  - Skeleton screens для Hero, Events, Members
  - Smooth transitions (fade-in)
  - Spinner → Skeleton preference
  
- [ ] **Error states:**
  - "Не удалось загрузить события" (retry button)
  - "Организация не найдена" (404 page)
  - Network error handling
  
- [ ] **Empty states:**
  - "Пока нет предстоящих событий" (beautiful illustration)
  - "Новых участников еще нет"
  - Helpful CTAs ("Создай первое событие" if admin)
  
- [ ] **Micro-interactions:**
  - Hover effects на карточках (scale, shadow)
  - Button press animation
  - Link underline on hover
  
- [ ] **Performance:**
  - Image optimization (next/image)
  - Code splitting (dynamic imports)
  - Prefetch links (next/link)

#### Task 6.2: Mobile UX (2 hours)
- [ ] Test на iPhone (Safari)
- [ ] Test на Android (Chrome)
- [ ] Touch targets ≥ 44px
- [ ] Horizontal scroll smooth
- [ ] Bottom navigation не перекрывает контент

#### Task 6.3: Cross-browser testing (1 hour)
- [ ] Chrome (desktop + mobile)
- [ ] Safari (desktop + mobile)
- [ ] Firefox (desktop)
- [ ] Edge (desktop)

**Checklist Day 6:**
- [ ] All loading states работают
- [ ] Error handling graceful
- [ ] Empty states красивые
- [ ] Mobile UX отличный
- [ ] Cross-browser tested
- [ ] Deploy staging

---

### **DAY 7 (Nov 25, Monday): Documentation + Production Deploy**

#### Morning (2 hours):
**Task 7.1: Documentation**
- [ ] **Code comments:**
  - Docstrings для функций
  - Inline comments для сложной логики
  - TypeScript types для всех props
  
- [ ] **User Guide:**
  - Создать `docs/USER_GUIDE_HOME_PAGE.md`
  - Screenshots (staging)
  - Описание каждой секции
  - FAQ для участников
  
- [ ] **Technical docs:**
  - Update `docs/COMPREHENSIVE_PRD.md` (home page section)
  - API endpoints documentation
  - Component props reference

#### Afternoon (2 hours):
**Task 7.2: Production deployment**
- [ ] **Pre-deploy checklist:**
  - [ ] All tests passed (manual smoke test)
  - [ ] Performance check (Lighthouse score > 90)
  - [ ] Accessibility check (WCAG AA)
  - [ ] Security audit (no exposed API keys)
  - [ ] Database migrations ready (if any)
  
- [ ] **Deploy:**
  - `git checkout main`
  - `git merge feature/home-page`
  - `vercel --prod`
  - Monitor deployment logs
  
- [ ] **Post-deploy:**
  - Smoke test на production
  - Check analytics (Vercel Analytics)
  - Monitor errors (Sentry/logs)
  - Notify team (если есть)

**Task 7.3: User feedback setup**
- [ ] Добавить feedback widget (опционально)
- [ ] Setup analytics events:
  - `home_page_viewed`
  - `event_card_clicked`
  - `quick_link_clicked`
  - `member_card_clicked`
- [ ] Create feedback form (Google Forms/Typeform)

**Checklist Day 7:**
- [ ] Documentation complete
- [ ] Production deploy successful
- [ ] Post-deploy checks passed
- [ ] Analytics tracking работает
- [ ] Feedback mechanism setup
- [ ] WEEK 1-2 COMPLETE! 🎉

---

## 🎨 VISUAL STRUCTURE (Wireframe)

```
┌─────────────────────────────────────────────────────────┐
│ [Logo] ORG NAME                              [Profile]  │
│ Brief description of the organization                   │
│ 150 участников · 12 событий · 8 материалов             │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 🎉 Добро пожаловать, Иван! (если новичок < 7 days)     │
│ Ты в сообществе "TechClub" уже 3 дня                    │
│                                                          │
│ Начни с этого:                                           │
│ → Изучи материалы                                        │
│ → Зарегистрируйся на событие                            │
│ → Представься в Telegram-группе                         │
│                                                          │
│ [Скрыть] ✕                                               │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ ⏰ С твоего последнего визита (if inactive > 14 days)   │
│                                                          │
│ → 3 новых события                                        │
│ → 12 новых участников                                    │
│ → 2 новых материала                                      │
│                                                          │
│ [Посмотреть всё новое]                                   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 📅 МОИ СОБЫТИЯ (if has registrations)                   │
│                                                          │
│ ┌───────────────────────────────────────────────────┐  │
│ │ Hackathon 2025                    [Сегодня!] 🔥   │  │
│ │ 15 ноября, 18:00                                  │  │
│ │ [Подробнее] [Отменить регистрацию]                │  │
│ └───────────────────────────────────────────────────┘  │
│                                                          │
│ ┌───────────────────────────────────────────────────┐  │
│ │ Лекция по AI                      [Завтра]        │  │
│ │ 16 ноября, 19:00                                  │  │
│ │ [Подробнее] [Отменить регистрацию]                │  │
│ └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 📅 ПРЕДСТОЯЩИЕ СОБЫТИЯ                    [Все события]│
│                                                          │
│ ┌─────────┐  ┌─────────┐  ┌─────────┐                 │
│ │[Image]  │  │[Image]  │  │[Image]  │                 │
│ │Event 1  │  │Event 2  │  │Event 3  │                 │
│ │         │  │         │  │         │                 │
│ │15 ноя   │  │20 ноя   │  │25 ноя   │                 │
│ │18:00    │  │19:00    │  │20:00    │                 │
│ │📍Online │  │📍Москва │  │📍Online │                 │
│ │         │  │         │  │         │                 │
│ │25 чел   │  │18 чел   │  │42 чел   │                 │
│ │         │  │         │  │         │                 │
│ │[Регистр]│  │[Регистр]│  │[Регистр]│                 │
│ └─────────┘  └─────────┘  └─────────┘                 │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 🔗 БЫСТРЫЕ ССЫЛКИ                                        │
│                                                          │
│ ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐│
│ │  👤      │  │  📅      │  │  📚      │  │  💬      ││
│ │  Мой     │  │  Все     │  │  Мате    │  │  Telegram││
│ │  Профиль │  │  События │  │  риалы   │  │  Группы  ││
│ └──────────┘  └──────────┘  └──────────┘  └──────────┘│
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 👥 НОВЫЕ УЧАСТНИКИ                     [Все участники] │
│                                                          │
│ ┌──┐  ┌──┐  ┌──┐  ┌──┐  ┌──┐  ┌──┐                   │
│ │▪│  │▪│  │▪│  │▪│  │▪│  │▪│ →                      │
│ │A │  │B │  │C │  │D │  │E │  │F │                   │
│ │  │  │  │  │  │  │  │  │  │  │  │                   │
│ │Name│ │Name│ │Name│ │Name│ │Name│ │Name│              │
│ │@usr│ │@usr│ │@usr│ │@usr│ │@usr│ │@usr│              │
│ └──┘  └──┘  └──┘  └──┘  └──┘  └──┘                   │
└─────────────────────────────────────────────────────────┘
```

---

## 📊 DATA STRUCTURE

### HomePageData Type:
```typescript
interface HomePageData {
  organization: {
    id: string
    name: string
    logo_url: string | null
    description: string | null
    member_count: number
    event_count: number
    material_count: number
  }
  
  currentParticipant: {
    id: string
    full_name: string
    username: string | null
    avatar_url: string | null
    joined_at: string
    days_in_community: number
    events_attended: number
    last_active_at: string
    is_newcomer: boolean  // < 7 days
    is_inactive: boolean  // > 14 days no activity
  }
  
  upcomingEvents: Array<{
    id: string
    title: string
    description: string | null
    cover_image_url: string | null
    event_date: string
    start_time: string
    event_type: 'online' | 'offline'
    location_info: string | null
    registered_count: number
    is_user_registered: boolean
  }>
  
  myEventRegistrations: Array<{
    event_id: string
    event_title: string
    event_date: string
    start_time: string
    registered_at: string
    days_until_event: number
  }>
  
  recentMembers: Array<{
    id: string
    full_name: string
    username: string | null
    avatar_url: string | null
    joined_at: string
  }>
  
  activitySummary?: {  // только если is_inactive
    new_events_count: number
    new_members_count: number
    new_materials_count: number
    since: string
  }
}
```

---

## 🔍 TESTING CHECKLIST

### Functional Testing:
- [ ] **Hero Section:**
  - [ ] Organization logo отображается
  - [ ] Member count корректный
  - [ ] Description рендерится (с null check)

- [ ] **Upcoming Events:**
  - [ ] Показывает до 3 событий
  - [ ] Кнопка "Зарегистрироваться" работает
  - [ ] Redirect на event detail работает
  - [ ] Empty state если нет событий

- [ ] **Quick Links:**
  - [ ] Все 4 ссылки работают
  - [ ] Icon + title отображаются
  - [ ] Hover effect работает

- [ ] **Recent Members:**
  - [ ] Показывает 5 последних
  - [ ] Avatar fallback (initials)
  - [ ] Horizontal scroll работает
  - [ ] Click на member card → detail page

- [ ] **Welcome Newcomer:**
  - [ ] Показывается только новичкам (< 7 days)
  - [ ] Dismissible работает (localStorage)
  - [ ] CTAs кликабельны

- [ ] **My Events:**
  - [ ] Показывается только зарегистрированным
  - [ ] Badge "Сегодня/Завтра" корректен
  - [ ] Отмена регистрации работает

- [ ] **What You Missed:**
  - [ ] Показывается только неактивным (> 14 days)
  - [ ] Counts корректные
  - [ ] Links работают

### Performance Testing:
- [ ] Page load < 2s (3G connection)
- [ ] Images optimized (next/image)
- [ ] No layout shifts (CLS < 0.1)
- [ ] First Contentful Paint < 1.5s

### Accessibility Testing:
- [ ] Keyboard navigation работает
- [ ] Screen reader friendly
- [ ] Color contrast (WCAG AA)
- [ ] Alt text для изображений

### Mobile Testing:
- [ ] Responsive на 320px width
- [ ] Touch targets ≥ 44px
- [ ] No horizontal scroll (except intentional)
- [ ] Bottom nav не перекрывает

---

## 📈 SUCCESS METRICS

### Week 1-2 Goals:
- [ ] **Home page deployed** на production
- [ ] **Load time** < 2s
- [ ] **Mobile UX score** ≥ 9/10 (user testing)
- [ ] **Bounce rate** < 40% (vs ~60% без home page)
- [ ] **Time on page** > 1 min

### User Feedback:
- [ ] 3+ users tested (новички, активные, неактивные)
- [ ] Feedback form filled (что нравится, что улучшить)
- [ ] No critical usability issues

---

## 🚀 DEPLOYMENT STRATEGY

### Staging Deployment (каждый день):
```bash
git add .
git commit -m "feat(home): [description]"
git push origin feature/home-page
# Vercel auto-deploys to staging
```

### Production Deployment (Day 7):
```bash
git checkout main
git merge feature/home-page
git push origin main
vercel --prod
```

### Rollback Plan:
```bash
vercel rollback
# или
git revert HEAD
git push origin main
```

---

## 📝 NOTES

### Design Decisions:
- **Order of sections:** Welcome/What You Missed → Hero → My Events → Upcoming → Quick Links → Recent Members
  - *Rationale:* Персонализация сначала, затем общая информация
  
- **3 upcoming events** (не 5):
  - *Rationale:* Меньше = больше фокуса, не overwhelm
  
- **Horizontal scroll** для Recent Members:
  - *Rationale:* Экономия vertical space, mobile-friendly

### Technical Decisions:
- **Server Component** для main page:
  - *Rationale:* SEO, fast initial load, no client JS для статики
  
- **Separate API endpoint** вместо direct DB:
  - *Rationale:* Reusable, cacheable, easier testing

### Future Enhancements (Week 3+):
- [ ] Activity feed (recent actions in community)
- [ ] Notifications center (bell icon)
- [ ] Search (global search bar)
- [ ] Dark mode toggle

---

**Ready to start Day 1?** Let's build! 🔨

