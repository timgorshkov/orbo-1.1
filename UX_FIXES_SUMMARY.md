# UX Fixes Summary - Унификация интерфейса

## Статус

### ✅ Завершено:
1. Ответ о боте в документации
2. Создан единый layout для всех страниц (`/app/[org]/layout.tsx`)
3. Убрана логика `isMember` из `EventsList`
4. Обновлены страницы:
   - `/dashboard` - убран AppShell
   - `/events` - убран CollapsibleSidebar
   - `/members` - убран CollapsibleSidebar  
   - `/settings` - убран AppShell
   - `/materials/layout.tsx` - упрощён

### 🔄 В процессе:
- Удаление AppShell из остальных страниц

### 📋 Осталось обновить (убрать AppShell):

#### Критичные страницы (часто используются):
- [ ] `/telegram/page.tsx`
- [ ] `/telegram/analytics/page.tsx`
- [ ] `/events/[id]/page.tsx`
- [ ] `/events/new/page.tsx`

#### Второстепенные страницы:
- [ ] `/telegram/groups/[groupId]/page.tsx`
- [ ] `/telegram/message/page.tsx`
- [ ] `/telegram/account/page.tsx`
- [ ] `/telegram/available-groups/page.tsx`
- [ ] `/telegram/select-groups/page.tsx`
- [ ] `/telegram/check-groups/page.tsx`
- [ ] `/telegram/setup-telegram/page.tsx`
- [ ] `/integrations/page.tsx`
- [ ] `/integrations/[connector]/page.tsx`
- [ ] `/participants/new/page.tsx`
- [ ] `/members/[participantId]/page.tsx`
- [ ] `/settings/invites/page.tsx`

## Шаблон замены для каждого файла

###  **1. Удалить импорты:**
```typescript
// Удалить:
import AppShell from '@/components/app-shell'
import { getOrgTelegramGroups } from '@/lib/server/getOrgTelegramGroups'
```

### **2. Удалить получение telegramGroups:**
```typescript
// Удалить:
const telegramGroups = await getOrgTelegramGroups(params.org)
```

### **3. Заменить обёртку:**
```typescript
// Было:
<AppShell orgId={params.org} currentPath="..." telegramGroups={...}>
  <div>Контент</div>
</AppShell>

// Стало:
<div className="p-6">
  <div>Контент</div>
</div>
```

## Преимущества нового подхода

### 1. **Единый интерфейс для всех ролей**
- Админы и участники видят одинаковую структуру навигации
- Разница только в доступных пунктах меню (через permissions)
- Никаких "прыжков" при переходе между разделами

### 2. **Упрощённая архитектура**
- Один layout вместо двух систем (AppShell + CollapsibleSidebar)
- Логика роли и permissions централизована
- Легче поддерживать и расширять

### 3. **Лучшая производительность**
- Данные организации и групп загружаются один раз в layout
- Нет дублирования запросов на каждой странице

### 4. **Консистентный UX**
- Одинаковое поведение sidebar для всех страниц
- Сохранение состояния (collapsed/expanded) в localStorage
- Плавная навигация без перезагрузки sidebar

## Следующие шаги

### Задача 4: Приглашения в раздел Участники
- Создать вкладки в `/members`
- Переместить InvitesManager
- Показывать вкладку "Приглашения" только для админов

### Задача 5: Замена терминологии
- Глобальная замена "организация" → "пространство"
- Обновить UI тексты
- Обновить документацию
- Возможно обновить алиасы в БД запросах

---

**Дата:** 2025-10-10  
**Автор:** AI Assistant

