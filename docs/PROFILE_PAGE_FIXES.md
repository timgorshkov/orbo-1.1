# Исправления страницы профиля

## ✅ Исправленные проблемы

### 1. Дублирующее левое меню

**Проблема:** На странице профиля использовался `AppShell`, который рендерил свое меню, в то время как в `layout.tsx` уже используется `CollapsibleSidebar`.

**Решение:**
- ✅ Убран импорт `AppShell` из `app/app/[org]/profile/page.tsx`
- ✅ Убраны все обертки `<AppShell>` со страницы
- ✅ Страница теперь рендерит только свой контент без дублирования навигации

**Файл:** `app/app/[org]/profile/page.tsx`

```tsx
// БЫЛО:
import AppShell from '@/components/app-shell'
return (
  <AppShell orgId={params.org} currentPath="/profile">
    <div className="p-8">...</div>
  </AppShell>
)

// СТАЛО:
return (
  <div className="p-8 max-w-4xl mx-auto">
    ...
  </div>
)
```

### 2. Недостаточно информации о участнике

**Проблема:** На странице профиля не отображались все поля participant (телефон, email участника, first_name, last_name, username, source, custom_attributes, last_activity_at).

**Решение:**

#### 2.1. Расширен API endpoint

**Файл:** `app/api/user/profile/route.ts`

Теперь API возвращает ВСЕ поля participant:
```typescript
// БЫЛО:
.select('id, full_name, bio, photo_url, custom_attributes, tg_user_id, tg_username, status')

// СТАЛО:
.select('id, full_name, first_name, last_name, username, bio, photo_url, email, phone, custom_attributes, tg_user_id, tg_username, status, source, last_activity_at')
```

#### 2.2. Расширен TypeScript тип ProfileData

**Файл:** `app/app/[org]/profile/page.tsx`

Добавлены новые поля в тип `participant`:
```typescript
participant: {
  id: string
  full_name: string | null
  first_name: string | null      // NEW
  last_name: string | null       // NEW
  username: string | null        // NEW
  bio: string | null
  photo_url: string | null
  email: string | null           // NEW
  phone: string | null           // NEW
  custom_attributes: any
  tg_user_id: string | null
  tg_username: string | null
  status: string
  source: string | null          // NEW
  last_activity_at: string | null // NEW
} | null
```

#### 2.3. Добавлено отображение всех полей

**Файл:** `app/app/[org]/profile/page.tsx`

В карточке профиля теперь отображаются:

**📇 Контактная информация:**
- Email участника (если есть)
- Телефон (если есть)
- Username (если есть)

**ℹ️ Дополнительная информация:**
- Имя (first_name)
- Фамилия (last_name)
- Источник (source: telegram/manual/etc)
- Последняя активность (last_activity_at)

**🏷️ Дополнительные атрибуты:**
- Все кастомные атрибуты из `custom_attributes` (если есть)

**👥 Администрирование:**
- Список групп, где пользователь администратор (если есть)

### 3. Кнопка "Выйти из профиля"

**Проблема:** Кнопка "Выйти из профиля" была внизу страницы в отдельной карточке "Настройки аккаунта".

**Решение:**
- ✅ Убрана секция "Настройки аккаунта" внизу страницы
- ✅ Кнопка перенесена в хедер страницы (справа от заголовка)
- ✅ Стилизация: прозрачный фон, красный текст, красная обводка
- ✅ Hover эффект: красный фон при наведении

**Код:**
```tsx
<div className="mb-8 flex items-start justify-between">
  <div>
    <h1 className="text-3xl font-bold text-gray-900">Профиль</h1>
    <p className="text-gray-600 mt-2">
      Управление вашим профилем в организации {profile.organization?.name}
    </p>
  </div>
  <Button
    onClick={handleLogout}
    variant="outline"
    className="text-red-600 border-red-300 hover:bg-red-50 bg-transparent"
  >
    <LogOut className="h-4 w-4 mr-2" />
    Выйти из профиля
  </Button>
</div>
```

## 📐 Новая структура страницы профиля

```
┌────────────────────────────────────────────────────────┐
│  Профиль                          [Выйти из профиля]   │ ← Header
│  Управление вашим профилем...                          │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│  [Аватарка] Иван Иванов                [Редактировать] │
│             ivan@example.com ✓                         │
│             👨‍💼 Администратор                          │
├────────────────────────────────────────────────────────┤
│  Био: Текст описания...                                │
│                                                        │
│  📇 Контактная информация                              │
│  📧 Email: ivan.participant@example.com                │
│  📞 Телефон: +7 999 123-45-67                         │
│  👤 Username: @ivan_ivanov                             │
│                                                        │
│  ℹ️ Дополнительная информация                          │
│  Имя: Иван                                             │
│  Фамилия: Иванов                                       │
│  Источник: telegram                                    │
│  Последняя активность: 20.10.2024, 15:30              │
│                                                        │
│  🏷️ Дополнительные атрибуты                            │
│  role: developer                                       │
│  department: Engineering                               │
│                                                        │
│  👥 Администратор в группах (2)                        │
│  [Группа 1] [Группа 2]                                │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│  📧 Email аккаунт                                      │
│  Email: ivan@example.com                               │
│  Статус: ✓ Подтвержден                                │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│  💬 Telegram аккаунт в этой организации                │
│  Username: @ivan_ivanov                                │
│  User ID: 123456789                                    │
│  Статус: ✓ Верифицирован (15.01.2025)                 │
└────────────────────────────────────────────────────────┘
```

## 📁 Измененные файлы

### 1. `app/app/[org]/profile/page.tsx`
- Убран импорт `AppShell`
- Убраны обертки `<AppShell>`
- Расширен тип `ProfileData.participant` (добавлены все поля)
- Добавлен хедер с кнопкой "Выйти"
- Убрана секция "Настройки аккаунта"
- Добавлены секции для отображения всех полей participant:
  - Контактная информация (email, phone, username)
  - Дополнительная информация (first_name, last_name, source, last_activity_at)
  - Дополнительные атрибуты (custom_attributes)
  - Администрирование (admin_groups)

### 2. `app/api/user/profile/route.ts`
- Расширен SELECT для `participants` таблицы
- Теперь возвращает все поля: `full_name, first_name, last_name, username, bio, photo_url, email, phone, custom_attributes, tg_user_id, tg_username, status, source, last_activity_at`

## ✅ Результат

### До исправлений:
- ❌ Двойное меню (старое + новое)
- ❌ Показывались только: id, full_name, bio, photo_url, custom_attributes, tg_user_id, tg_username, status
- ❌ Кнопка "Выйти" внизу страницы в отдельной карточке

### После исправлений:
- ✅ Одно меню (CollapsibleSidebar из layout)
- ✅ Показываются ВСЕ поля participant
- ✅ Кнопка "Выйти" в хедере справа от заголовка

## 🚀 Применение

Изменения уже применены. Просто задеплойте:

```bash
git add .
git commit -m "fix: profile page improvements - remove duplicate menu, show all participant fields, move logout button to header"
git push
```

## 📋 Тестирование

1. **Откройте страницу профиля:**
   - Клик на аватарку в меню → `/app/[org]/profile`

2. **Проверьте, что:**
   - ✅ Только одно меню (слева)
   - ✅ Кнопка "Выйти из профиля" справа от заголовка (красная, прозрачная)
   - ✅ В карточке профиля отображаются все поля:
     - Основная информация (аватарка, имя, email, роль)
     - Био (если есть)
     - Контактная информация (email участника, телефон, username)
     - Дополнительная информация (имя, фамилия, источник, активность)
     - Дополнительные атрибуты (custom_attributes)
     - Группы администрирования (если есть)

3. **Сравните с карточкой участника:**
   - Откройте страницу участника `/app/[org]/members`
   - Найдите своего участника
   - ✅ Должна отображаться та же информация

## 🔍 Возможные проблемы

### Профиль пустой (нет контактной информации)

**Причина:** У пользователя нет записи в `participants` или поля не заполнены.

**Решение:**
- Привяжите Telegram аккаунт (создастся запись в `participants`)
- Заполните поля через редактирование профиля

### Custom attributes не отображаются

**Причина:** `custom_attributes` пустой объект или NULL.

**Решение:**
- Проверить в базе данных: `SELECT custom_attributes FROM participants WHERE id = 'xxx'`
- Если пусто - это нормально, секция просто не отобразится

### Последняя активность не отображается

**Причина:** `last_activity_at` NULL (пользователь еще не активен).

**Решение:**
- Это нормально для новых пользователей
- Поле обновляется при активности в Telegram группах

## 📚 Связанная документация

- `docs/PROFILE_PAGE_CONCEPT.md` - полная концепция
- `docs/PROFILE_PAGE_IMPLEMENTATION.md` - детальная документация
- `docs/PROFILE_PAGE_QUICK_SUMMARY.md` - краткое резюме

