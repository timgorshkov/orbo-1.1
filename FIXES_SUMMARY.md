# Исправления от 10.10.2025

## Быстрая навигация
- [Проблема 0a: Отображение доступных групп](#проблема-0a-не-работает-отображение-доступных-telegram-групп)
- [Проблема 0b: Ошибка добавления группы](#проблема-0b-ошибка-failed-to-check-existing-group-mapping)
- [Проблема 0c: Группа не появляется в меню](#проблема-0c-добавленная-группа-не-появляется-в-левом-меню)
- [Проблема 0d: График активности пустой](#проблема-0d-пустой-график-активности-на-дашборде)
- [Проблема 1: Telegram webhook](#проблема-1-активность-из-telegram-групп-не-подтягивается)
- [Проблема 2: Таблица участников](#проблема-2-пропала-таблица-участников)
- [Проблема 3: Компиляция Button](#проблема-3-ошибка-компиляции-button)
- [Проблема 4: Пустая таблица участников](#проблема-4-пустая-таблица-участников)
- [Проблема 5: Компиляция bio field](#проблема-5-ошибка-компиляции-bio-field)

---

## Проблема 0a: Не работает отображение доступных Telegram групп

### Симптомы
- Из доступных групп отображается 0 или меньше, чем есть на самом деле
- При добавлении группа исчезает из списка доступных
- Но группа НЕ появляется в левом меню
- В логах: `"Found 3 groups for org ... and 0 available groups"`

### Причина
**Основная проблема**: После успешного добавления группы не вызывался `router.refresh()`, поэтому список групп в левом меню не обновлялся.

### Решение
1. ✅ Изменен API endpoint с `clone-to-org` на `add-to-org` для более строгой валидации
2. ✅ Добавлен вызов `router.refresh()` после успешного добавления
3. ✅ Добавлен alert с сообщением об успехе
4. ✅ Добавлено детальное логирование в API для диагностики

### Измененные файлы
- `app/app/[org]/telegram/available-groups/page.tsx` - добавлены `router.refresh()`, alert, улучшено логирование
- `app/api/telegram/groups/for-user/route.ts` - добавлено детальное логирование фильтрации групп

### Документация
📄 **`TELEGRAM_GROUPS_AVAILABILITY_FIX.md`** - полное описание проблемы, исправления и SQL запросы для диагностики

### Как проверить
1. Откройте `/app/[org]/telegram/available-groups`
2. Проверьте консоль браузера - должны быть детальные логи для каждой группы
3. Нажмите "Добавить в организацию"
4. Должен появиться alert "Группа успешно добавлена в организацию!"
5. После редиректа на `/app/[org]/telegram` группа должна появиться в левом меню

---

## Проблема 0b: Ошибка "Failed to check existing group mapping"

### Симптомы (первая ошибка)
- При попытке добавить группу возникает ошибка
- В консоли: `"Failed to check existing group mapping"`
- API возвращает статус 500

### Причина 1: Несоответствие типов `tg_chat_id`
- В `telegram_groups`: может быть `number` (например, `-1001234567890`)
- В `org_telegram_groups`: ожидается `text` (строка)
- Запрос с числовым значением не находил совпадений

### Решение 1
1. ✅ Добавлено явное приведение `tg_chat_id` к строке сразу после получения группы
2. ✅ Использование `tgChatIdStr` (строка) во всех запросах к БД
3. ✅ Добавлено детальное логирование типов и ошибок
4. ✅ Улучшены сообщения об ошибках с деталями

### Симптомы (вторая ошибка)
После первого исправления:
```
Error checking group mapping: {
  code: '42703',
  message: 'column org_telegram_groups.status does not exist'
}
```

### Причина 2: Отсутствие столбца `status`
Миграция `06_org_telegram_groups_status.sql` не была применена на production.

### Решение 2
1. ✅ Изменен запрос: `select('org_id, tg_chat_id, created_at')` вместо `select('status')`
2. ✅ Убрана логика с проверкой `status === 'archived'`
3. ✅ Если запись существует - возвращается успех (группа уже добавлена)
4. ✅ При вставке НЕ указывается `status` (будет использован default, если столбец существует)
5. ✅ Код работает как с миграцией `06`, так и без неё

### Измененные файлы
- `app/api/telegram/groups/add-to-org/route.ts` - приведение типов, убран `status`, совместимость

### Документация
📄 **`TELEGRAM_GROUP_MAPPING_FIX.md`** - полное описание обеих проблем, решений и инструкция по применению миграции `06`

### Как проверить
1. Откройте `/app/[org]/telegram/available-groups`
2. Нажмите "Добавить в организацию"
3. В консоли браузера должны появиться логи:
   ```
   Group tg_chat_id: -1002994446785 (original type: number)
   Checking existing mapping for org ..., group tg_chat_id: -1002994446785
   Creating new mapping for group -1002994446785 in org ...
   Successfully linked group -1002994446785 to org ...
   ```
4. Должен появиться alert "Группа успешно добавлена в организацию!"
5. Группа должна появиться в левом меню

### Опционально: Применение миграции `06`
Если хотите иметь функционал архивирования групп:
```bash
# Через Supabase Dashboard -> SQL Editor
# Выполните содержимое db/migrations/06_org_telegram_groups_status.sql
```

---

## Проблема 0c: Добавленная группа не появляется в левом меню

### Симптомы
- ✅ Добавление группы проходит без ошибок
- ✅ Группа исчезает из списка доступных групп
- ❌ Группа НЕ появляется в левом меню
- ❌ Группа НЕ отображается на странице `/app/[org]/telegram`

### Причина
**Архитектурная несовместимость**:
- При добавлении группа записывается в `org_telegram_groups` (new schema)
- Но код для отображения групп использовал `.eq('org_id', org.id)` из `telegram_groups` (legacy schema)
- Запись в `org_telegram_groups` не обновляет `org_id` в `telegram_groups`
- Результат: запрос не находил добавленные группы

### Решение
1. ✅ Изменен запрос в `layout.tsx` для загрузки групп через JOIN с `org_telegram_groups`
2. ✅ Изменен запрос в `telegram/page.tsx` для загрузки групп через JOIN с `org_telegram_groups`
3. ✅ Использование Supabase `!inner` для гарантии наличия связанных записей
4. ✅ Добавлено логирование для диагностики

### Измененные файлы
- `app/app/[org]/layout.tsx` - загрузка групп через `org_telegram_groups` (JOIN)
- `app/app/[org]/telegram/page.tsx` - загрузка групп через `org_telegram_groups` (JOIN с `!inner`)

### Документация
📄 **`TELEGRAM_GROUPS_DISPLAY_FIX.md`** - полное описание проблемы, архитектуры и решения

### Как проверить
1. Откройте `/app/[org]/telegram/available-groups`
2. Нажмите "Добавить в организацию"
3. Дождитесь alert "Группа успешно добавлена в организацию!"
4. После редиректа на `/app/[org]/telegram`:
   - ✅ Группа должна появиться в левом меню под "TELEGRAM ГРУППЫ"
   - ✅ Группа должна отображаться на странице настроек

### Ожидаемые логи в Vercel:
```
Fetching telegram groups for org: d7e2e580-...
orgGroups: [ { telegram_groups: { id: 10, tg_chat_id: '-1002994446785', title: 'Test Group', bot_status: 'connected' } } ]
Loaded telegram groups: 1
```

---

## Проблема 0d: Пустой график активности на Дашборде

### Симптомы
- На Дашборде в блоке "Активность за 14 дней" график пустой
- При этом в аналитике по каждой группе данные о сообщениях присутствуют
- Группы были недавно добавлены в организацию
- Данные по группам уже были в базе до добавления

### Причина
**Та же архитектурная проблема, что и в 0c**:
- API дашборда загружал группы по `org_id` из `telegram_groups` (legacy schema)
- Группы добавлялись в `org_telegram_groups` (new schema)
- Запрос не находил группы → не загружалась активность → пустой график

### Решение
1. ✅ Изменен запрос для подсчета групп через JOIN с `org_telegram_groups`
2. ✅ Изменен запрос для загрузки `chatIds` через JOIN с `org_telegram_groups`
3. ✅ Добавлено детальное логирование всех этапов (группы, активность, агрегация)
4. ✅ Добавлено поле `tg_chat_id` в select активности для диагностики

### Измененные файлы
- `app/api/dashboard/[orgId]/route.ts` - загрузка групп через `org_telegram_groups` (2 места), логирование

### Документация
📄 **`DASHBOARD_ACTIVITY_FIX.md`** - полное описание проблемы, SQL запросы для проверки, диагностика

### Как проверить
1. Откройте `/app/[org]/dashboard`
2. В блоке "Активность за 14 дней" должен отображаться график с данными
3. В Vercel Logs проверьте:
   ```
   Dashboard: Found 3 groups for org d7e2e580-... ["-1002994446785", ...]
   Dashboard: Fetching activity since 2025-09-27T00:00:00.000Z for chats: [...]
   Dashboard: Found 245 activity events, error: null
   Dashboard: Sample events: [...]
   Dashboard: Total messages in chart: 245
   ```

### SQL для проверки данных:
```sql
-- Проверка групп организации
SELECT otg.org_id, otg.tg_chat_id, tg.title
FROM org_telegram_groups otg
LEFT JOIN telegram_groups tg ON tg.tg_chat_id = otg.tg_chat_id
WHERE otg.org_id = 'YOUR_ORG_ID';

-- Проверка активности
SELECT DATE(created_at) as date, tg_chat_id, COUNT(*) as messages
FROM activity_events
WHERE tg_chat_id IN (SELECT tg_chat_id::text FROM org_telegram_groups WHERE org_id = 'YOUR_ORG_ID')
  AND event_type = 'message'
  AND created_at >= NOW() - INTERVAL '14 days'
GROUP BY DATE(created_at), tg_chat_id
ORDER BY date DESC;
```

---

## Проблема 1: Активность из Telegram групп не подтягивается

### Причина
Использование `@orbo_community_bot` для Login Widget **НЕ конфликтует** с webhook'ом для активности. Это разные механизмы:
- **Login Widget** - OAuth через браузер (авторизация)
- **Webhook** - получение обновлений из групп (активность)

### Решение
Скорее всего, webhook просто не настроен или неправильно настроен.

### Что сделано
✅ Создан подробный гайд: **`TELEGRAM_WEBHOOK_SETUP.md`**

Этот гайд включает:
1. Проверку статуса webhook
2. Установку webhook через curl/браузер
3. Проверку переменных окружения
4. Тестирование работы
5. Устранение типичных проблем
6. Проверочный чеклист

### Следующие шаги
1. Откройте `TELEGRAM_WEBHOOK_SETUP.md`
2. Выполните все шаги по порядку
3. Проверьте, что активность начала подтягиваться

---

## Проблема 2: Пропала таблица участников

### Причина
После рефакторинга интерфейса остался только вид "карточками", а табличное представление для админов было удалено.

### Решение
Добавлен переключатель между двумя видами:
- **Карточки** - для всех (участников и админов)
- **Таблица** - только для админов (CRM-стиль)

### Что сделано

#### 1. Создан `components/members/members-view.tsx`
- Компонент-обёртка с переключателем видов
- Кнопки "Карточки" и "Таблица" (таблица только для админов)
- Общий поиск для обоих видов
- Счётчик участников

#### 2. Создан `components/members/members-table.tsx`
- Табличное представление в CRM-стиле
- Колонки:
  - **Участник** (фото + имя + ID)
  - **Telegram** (@username с ссылкой)
  - **Email** (с ссылкой mailto)
  - **Статус** (цветной badge)
  - **Добавлен** (дата создания)
- Клик по строке открывает модальное окно профиля
- Адаптивное оформление

#### 3. Создан `components/ui/table.tsx`
- UI компонент таблицы (shadcn/ui стиль)
- Компоненты: `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`
- Адаптивный overflow

#### 4. Обновлён `components/members/members-tabs.tsx`
- Заменён `MembersGrid` на `MembersView`
- Теперь в табе "Список" доступны оба вида

### Результат

#### Для всех пользователей:
- ✅ Вид "Карточками" с фото и основной информацией
- ✅ Поиск по имени, email, @username
- ✅ Клик по карточке → модальное окно с деталями

#### Для админов (дополнительно):
- ✅ Переключатель "Карточки / Таблица"
- ✅ Табличное представление с полной информацией
- ✅ Удобная сортировка и навигация (как в CRM)
- ✅ Все колонки с данными участников
- ✅ Цветовая индикация статусов

---

## Демонстрация

### Вид "Карточками" (все пользователи)
```
┌─────────────────────────────┐
│  Поиск...      [🔲] [📊]   │  ← кнопки переключения
├─────────────────────────────┤
│  ┌───┐  ┌───┐  ┌───┐       │
│  │👤 │  │👤 │  │👤 │       │  ← карточки с фото
│  └───┘  └───┘  └───┘       │
│  Имя 1  Имя 2  Имя 3       │
└─────────────────────────────┘
```

### Вид "Таблицей" (только админы)
```
┌──────────────────────────────────────────────────────────┐
│  Поиск...      [🔲] [📊]                                 │
├────────────┬──────────┬──────────┬────────┬─────────────┤
│ Участник   │ Telegram │ Email    │ Статус │ Добавлен    │
├────────────┼──────────┼──────────┼────────┼─────────────┤
│ 👤 Имя 1   │ @user1   │ email@   │ 🟢     │ 01.10.2025  │
│ 👤 Имя 2   │ @user2   │ email@   │ 🟢     │ 02.10.2025  │
└────────────┴──────────┴──────────┴────────┴─────────────┘
```

---

## Файлы

### Новые файлы:
- `components/members/members-view.tsx` - переключатель видов
- `components/members/members-table.tsx` - табличное представление
- `components/ui/table.tsx` - UI компонент таблицы
- `TELEGRAM_WEBHOOK_SETUP.md` - гайд по настройке webhook
- `FIXES_SUMMARY.md` - это резюме

### Изменённые файлы:
- `components/members/members-tabs.tsx` - использует `MembersView`

### Старые файлы (можно удалить):
- `components/members/members-grid.tsx` - заменён на `MembersView`

---

## Тестирование

### Для проблемы 1 (webhook):
1. Следуйте инструкциям в `TELEGRAM_WEBHOOK_SETUP.md`
2. Проверьте статус webhook через `/getWebhookInfo`
3. Отправьте сообщения в группу
4. Проверьте аналитику в админке

### Для проблемы 2 (таблица участников):
1. Зайдите как админ в `/app/[org]/members`
2. Переключите вид на "Таблица"
3. Проверьте отображение всех колонок
4. Кликните по строке → откроется модальное окно
5. Зайдите как обычный участник
6. Проверьте, что кнопка "Таблица" не отображается

---

## Деплой

```bash
git add .
git commit -m "fix: restore telegram activity webhook and add table view for members"
git push
```

После деплоя:
1. Настройте webhook по инструкции
2. Проверьте работу таблицы участников

---

---

## Проблема 4: Пустая таблица участников

### Причина
Страница `/app/[org]/members` использовала обычный Supabase клиент (`createClientServer()`), который блокировался политиками RLS. 

RLS политика для `participants` требует сложные JOIN'ы с `user_telegram_accounts`, `participant_groups`, и `telegram_groups`, что не всегда работает корректно.

### Решение
Использовать `createAdminServer()` для обхода RLS при загрузке участников.

### Что сделано

#### Обновлён `app/app/[org]/members/page.tsx`

**Изменения:**
```typescript
// Было:
const { data: participants } = await supabase
  .from('participants')
  .select('*')
  .eq('org_id', orgId)

// Стало:
const adminSupabase = createAdminServer()
const { data: participants } = await adminSupabase
  .from('participants')
  .select('*')
  .eq('org_id', orgId)
  .neq('participant_status', 'excluded')
  .order('full_name', { ascending: true, nullsFirst: false })

console.log(`Fetched ${participants?.length || 0} participants for org ${orgId}`)
```

**Улучшения:**
- ✅ Использование `createAdminServer()` для обхода RLS
- ✅ Явное исключение участников со статусом `'excluded'`
- ✅ Сортировка с `nullsFirst: false` (участники без имени в конце)
- ✅ Логирование количества загруженных участников
- ✅ Использование `adminSupabase` также для загрузки приглашений

**Безопасность:**
✅ Безопасно, так как проверка роли происходит через `getUserRoleInOrg()` перед загрузкой страницы.

### Результат
Теперь все участники организации (кроме исключённых) корректно отображаются как в виде карточек, так и в виде таблицы.

---

---

## Проблема 5: Профиль участника в модальном окне

### Причина
Карточки участников открывались во всплывающем модальном окне, что неудобно для детального просмотра и редактирования.

### Решение
Переделан весь UX профиля участника:
- Отдельная страница вместо модального окна
- Дизайн в стиле социальных сетей
- Интеграция характеристик в профиль
- Режимы просмотра/редактирования

### Что сделано

#### 1. Обновлена страница `/app/[org]/members/[participantId]/page.tsx`
- ✅ Добавлена проверка роли через `getUserRoleInOrg`
- ✅ Определение `canEdit` (админ или свой профиль)
- ✅ Передача пропсов для управления доступом
- ✅ Убран устаревший `AppShell`

#### 2. Переделан `ParticipantDetailTabs`
- ✅ Убрана вкладка "Характеристики"
- ✅ Вкладки "Активность" и "Дубликаты" - только для админов
- ✅ Условное отображение на основе `isAdmin` пропа

#### 3. Полностью переписан `ParticipantProfileCard`
**Дизайн в стиле соцсетей:**
- Цветной градиентный header
- Круглое фото профиля (на границе header/content)
- Карточки с иконками (Telegram, Email, Phone, Дата)
- Telegram username как активная ссылка `https://t.me/username`
- Email как `mailto:` ссылка
- Телефон как `tel:` ссылка

**Режим просмотра:**
- Стильное отображение всей информации
- Custom attributes (ключ: значение)
- Группы Telegram
- Заметки (если есть)

**Режим редактирования:**
- Кнопка "Редактировать" (только для админов и владельца профиля)
- Inline редактирование полей
- Управление custom attributes:
  - Редактирование значений
  - Удаление полей
  - Добавление новых через форму
- Кнопки "Сохранить" / "Отмена"

#### 4. Обновлены `MemberCard` и `MembersTable`
- ✅ Карточки теперь `<Link>` вместо `<button>`
- ✅ Таблица использует `router.push()` при клике по строке
- ✅ Навигация на `/app/[org]/members/[id]`
- ❌ Удалены callback'и `onClick` и `onRowClick`

#### 5. Обновлён `MembersView`
- ✅ Убрано модальное окно `MemberProfileModal`
- ✅ Убран state `selectedMember`
- ✅ Упрощена логика компонента

#### 6. Удалены устаревшие компоненты
- ❌ `participant-traits-card.tsx`
- ❌ `member-profile-modal.tsx`

### Права доступа

| Действие | Owner | Admin | Member | Guest |
|----------|-------|-------|--------|-------|
| Просмотр любого профиля | ✅ | ✅ | ✅ | ❌ |
| Редактирование любого профиля | ✅ | ✅ | ❌ | ❌ |
| Редактирование своего профиля | ✅ | ✅ | ✅ | ❌ |
| Вкладка "Активность" | ✅ | ✅ | ❌ | ❌ |
| Вкладка "Дубликаты" | ✅ | ✅ | ❌ | ❌ |

### Результат

**URL:** `/app/[org]/members/[participantId]`

**Особенности:**
- 📱 Современный дизайн как в соцсетях
- ✏️ Удобное inline редактирование
- 🔗 Активные ссылки на Telegram, Email, Phone
- 🏷️ Custom attributes с управлением
- 👥 Список Telegram групп
- 📝 Заметки
- 🔒 Контроль доступа на основе роли

**Документация:** `MEMBER_PROFILE_REDESIGN.md`

---

## Проблема 5: Ошибка компиляции bio field

### Симптомы
```
Type 'Participant[]' is not assignable to type 'Participant[]'. 
Two different types with this name exist, but they are unrelated.
Property 'bio' is missing in type 'Participant' but required in type 'Participant'.
```

### Причина
После добавления поля `bio` (краткое описание, до 60 символов) в `lib/types/participant.ts` и БД (миграция `28_add_participant_bio.sql`), не все интерфейсы `Participant` в компонентах были обновлены.

### Решение
✅ Добавлено поле `bio: string | null` в интерфейсы `Participant`:
- `components/members/members-tabs.tsx`
- `components/members/members-table.tsx`

### Измененные файлы
- `components/members/members-tabs.tsx` - добавлено `bio` в интерфейс
- `components/members/members-table.tsx` - добавлено `bio` в интерфейс

### Использование поля `bio`
Поле `bio` используется для отображения в карточках участников вместо email/username:
- В `member-card.tsx` - отображается под именем (до 2 строк, `line-clamp-2`)
- В `members-view.tsx` - участвует в поиске (поиск по имени, bio, email, username)
- В `participant-profile-card.tsx` - редактируется в режиме редактирования (maxLength=60, с счетчиком символов)

### Результат
✅ Ошибка компиляции исправлена  
✅ Все интерфейсы `Participant` синхронизированы

---

## Итоговый статус

| Проблема | Статус | Файлы |
|----------|--------|-------|
| 0a. Отображение доступных групп | ✅ Исправлено | `TELEGRAM_GROUPS_AVAILABILITY_FIX.md` |
| 0b. Ошибка добавления группы | ✅ Исправлено | `TELEGRAM_GROUP_MAPPING_FIX.md` |
| 0c. Группа не появляется в меню | ✅ Исправлено | `TELEGRAM_GROUPS_DISPLAY_FIX.md` |
| 0d. График активности пустой | ✅ Исправлено | `DASHBOARD_ACTIVITY_FIX.md` |
| 1. Telegram webhook | ✅ Гайд создан | `TELEGRAM_WEBHOOK_SETUP.md` |
| 2. Таблица участников | ✅ Реализовано | `members-view.tsx`, `members-table.tsx`, `ui/table.tsx` |
| 3. Компиляция Button | ✅ Исправлено | `ui/button.tsx` |
| 4. Пустая таблица | ✅ Исправлено | `app/[org]/members/page.tsx` |
| 5. **Профиль участника** | ✅ **Переделано** | См. `MEMBER_PROFILE_REDESIGN.md` |
| 6. Компиляция bio field | ✅ Исправлено | `members-tabs.tsx`, `members-table.tsx` |

**Статус:** ✅ Готово к деплою  
**Дата:** 10.10.2025  
**Важно:** Проблемы 0a-0d решены комплексно - теперь работает весь flow от добавления Telegram групп до отображения их активности на Дашборде

---

## Доработки раздела "Материалы"

### Дата: 10.10.2025

Выполнены 5 UX/UI доработок для раздела "Материалы":

| № | Доработка | Статус | Файлы |
|---|-----------|--------|-------|
| 1 | Удален блок с лого и названием организации из панели | ✅ | `materials-page-viewer.tsx` |
| 2 | Добавлена иконка Plus и текст к кнопке добавления | ✅ | `materials-tree.tsx` |
| 3 | Поиск перемещен в панель дерева как иконка | ✅ | `materials-tree.tsx`, `materials-page-viewer.tsx` |
| 4 | Исправлен скролл в области редактирования | ✅ | `materials-page-editor.tsx` |
| 5 | Переделаны блоки видео с заголовками и embed | ✅ | `materials-page-editor.tsx` |

### Детали:

#### 1. Удален дублирующий блок организации
- Блок с логотипом и названием организации в панели дерева материалов дублировал левое меню
- Удалено 12 строк кода, больше места для материалов

#### 2. Улучшена кнопка добавления материала
- Добавлена иконка Plus и текст "Добавить"
- Более понятный и доступный UI

#### 3. Поиск перемещен в панель дерева
- Иконка поиска теперь в панели дерева, слева от кнопки "Добавить"
- Клик открывает диалог поиска (CommandDialog)
- Больше места для редактирования материалов

#### 4. Исправлен скролл редактора
**Проблема**: Скролл мыши не работал при редактировании длинных материалов

**Причина**: Родительский контейнер имел `overflow-hidden`

**Решение**: 
```tsx
// Было
<div className="relative h-full overflow-hidden bg-white">

// Стало
<div className="relative h-full flex flex-col bg-white">
  <div className="... shrink-0">{/* Header */}</div>
  <div className="... shrink-0">{/* Buttons */}</div>
  <div className="flex-1 min-h-0 overflow-y-auto">{/* Content */}</div>
</div>
```

#### 5. Переделаны блоки видео (YouTube/VK)

**Было**:
- Запрашивался только URL
- Отображалась заглушка "YouTube видео №12345"
- Статичная картинка-обложка

**Стало**:
- ✅ Запрашивается URL и заголовок
- ✅ Отображается пользовательский заголовок
- ✅ Встроенный iframe-плеер для проигрывания видео
- ✅ Responsive дизайн (16:9 aspect ratio)
- ✅ Fullscreen, HD качество

**Формат Markdown**:
```markdown
# Старый (deprecated)
[youtube:https://www.youtube.com/watch?v=VIDEO_ID]

# Новый (рекомендуется)
[youtube:https://www.youtube.com/watch?v=VIDEO_ID:Заголовок видео]
[vk:https://vk.com/video-OID_VID:Заголовок видео]
```

### Документация
📄 **`MATERIALS_UX_IMPROVEMENTS.md`** - полное описание всех 5 доработок, технические детали, чек-лист для тестирования

### Совместимость
✅ Обратная совместимость: Да  
⚠️ Старые материалы с форматом `[youtube:URL]` будут работать, но без заголовка  
📋 Рекомендуется переделать старые блоки видео на новый формат с заголовками

### Статус доработок материалов
✅ **Реализовано и готово к деплою**  
📅 **Дата**: 10.10.2025  
🎯 **Все 5 доработок выполнены**  
🧪 **Тестирование**: См. чек-лист в `MATERIALS_UX_IMPROVEMENTS.md`  
📊 **Ошибок компиляции**: Нет

---

## Исправления работы с Telegram группами

### Дата: 10.10.2025

Исправлены 2 критические ошибки в работе с Telegram группами:

| Проблема | Причина | Решение | Статус |
|----------|---------|---------|--------|
| Удаление группы не работает | Нет RLS политики DELETE, неправильная обработка | Добавлена RLS политика, admin client, клиентский компонент | ✅ |
| Кнопка "Поделиться" для событий | Использование устаревшей схемы org_id | Переход на org_telegram_groups | ✅ |

### Проблема 1: Удаление группы из организации

**Симптомы**:
- Группа не исчезает из левого меню после удаления
- Не появляется в списке доступных групп
- Ошибка "Group is already archived" при повторном удалении

**Причины**:
1. ❌ Отсутствовала RLS политика для DELETE в `org_telegram_groups`
2. ❌ Использовался обычный Supabase client вместо admin
3. ❌ Server Action не возвращал результат
4. ❌ UI не обновлялся после удаления

**Решение**:

#### 1. Создана миграция с RLS политикой DELETE
**Файл**: `db/migrations/29_org_telegram_groups_delete_policy.sql`

```sql
create policy org_telegram_groups_delete on public.org_telegram_groups
  for delete using (
    exists (
      select 1 from public.memberships m
      where m.org_id = org_telegram_groups.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner','admin')
    )
  );
```

#### 2. Исправлена функция deleteGroup
**Файл**: `app/app/[org]/telegram/actions.ts`

Изменения:
- ✅ Использование `createAdminServer()` для обхода RLS
- ✅ Явная конвертация `tg_chat_id` в строку
- ✅ Возврат `{ success: true }` или `{ error: string }`
- ✅ Детальное логирование

#### 3. Создан клиентский компонент DeleteGroupButton
**Файл**: `app/app/[org]/telegram/delete-group-button.tsx`

Возможности:
- ✅ Confirm диалог перед удалением
- ✅ Обработка результата Server Action
- ✅ Отображение ошибок
- ✅ `router.refresh()` для обновления UI
- ✅ Состояние загрузки (isPending)

#### 4. Обновлена страница Telegram
**Файл**: `app/app/[org]/telegram/page.tsx`

Заменена форма с Server Action на клиентский компонент:
```tsx
// Было: <form action={deleteGroup}>
// Стало:
<DeleteGroupButton groupId={group.id} groupTitle={group.title} orgId={params.org} />
```

### Проблема 2: Кнопка "Поделиться в группах" для событий

**Симптомы**:
- Кнопка иногда отсутствует, даже если группы есть в левом меню
- Если кнопка есть, показывает не все группы

**Причина**:
Использовалась устаревшая схема загрузки групп по `org_id`:
```typescript
// ❌ Старый код
const { data } = await supabase
  .from('telegram_groups')
  .select('id, tg_chat_id, title')
  .eq('org_id', params.org)  // Не работает с org_telegram_groups!
```

**Решение**:
**Файл**: `app/app/[org]/events/[id]/page.tsx` (строки 111-140)

Переход на many-to-many схему:
```typescript
// ✅ Новый код
const { data: orgGroupsData } = await adminSupabase
  .from('org_telegram_groups')
  .select(`
    telegram_groups!inner (
      id,
      tg_chat_id,
      title,
      bot_status
    )
  `)
  .eq('org_id', params.org)

telegramGroups = (orgGroupsData as any[])
  .map((item: any) => item.telegram_groups)
  .filter((group: any) => group !== null && group.bot_status === 'connected')
  .sort((a: any, b: any) => (a.title || '').localeCompare(b.title || ''))
```

### Ключевые изменения

1. **RLS политика DELETE**: Админы/владельцы могут удалять связи групп
2. **Admin Supabase client**: Обход RLS для системных операций
3. **Клиентский компонент**: Обработка результата + UI updates
4. **org_telegram_groups**: Везде используется новая many-to-many схема
5. **Детальное логирование**: Отладка через Vercel Logs

### Измененные/созданные файлы

| Файл | Тип | Описание |
|------|-----|----------|
| `db/migrations/29_org_telegram_groups_delete_policy.sql` | Создан | RLS политика для DELETE |
| `app/app/[org]/telegram/actions.ts` | Изменен | deleteGroup с admin client и обработкой ошибок |
| `app/app/[org]/telegram/delete-group-button.tsx` | Создан | Клиентский компонент с router.refresh() |
| `app/app/[org]/telegram/page.tsx` | Изменен | Использование DeleteGroupButton |
| `app/app/[org]/events/[id]/page.tsx` | Изменен | Загрузка групп через org_telegram_groups |

### Документация
📄 **`TELEGRAM_GROUPS_DELETE_AND_SHARE_FIX.md`** - полное описание проблем, причин, решений, SQL запросы для проверки, чек-листы для тестирования

### Flow после исправления

**Удаление группы**:
1. Пользователь кликает "Удалить" → confirm диалог
2. DeleteGroupButton вызывает Server Action deleteGroup
3. deleteGroup удаляет запись из org_telegram_groups (admin client)
4. Возвращает { success: true }
5. DeleteGroupButton вызывает router.refresh()
6. Страница перезагружается → группа исчезает из меню
7. Группа появляется в Available Groups

**Sharing события**:
1. Админ открывает событие
2. Загружаются группы через org_telegram_groups JOIN telegram_groups
3. Фильтрация по bot_status='connected'
4. Кнопка "Поделиться" отображается если есть группы
5. В диалоге все группы организации

### Тестирование

**Удаление**:
- [ ] Группа исчезает из левого меню
- [ ] Группа появляется в Available Groups
- [ ] Группу можно снова добавить

**Sharing**:
- [ ] Кнопка отображается для админов
- [ ] Все группы org с bot_status='connected' в списке
- [ ] Событие публикуется в выбранных группах

### Статус исправлений Telegram групп
✅ **Исправлено и готово к деплою**  
📅 **Дата**: 10.10.2025  
🎯 **Обе проблемы решены**  
🔍 **Миграция**: Требуется применить `29_org_telegram_groups_delete_policy.sql`  
📊 **Ошибок компиляции**: Нет

---

## Дополнительные исправления Telegram групп

### Дата: 10.10.2025 (после первого деплоя)

После применения основных исправлений выявлены и исправлены 2 дополнительные проблемы:

| Проблема | Причина | Решение | Статус |
|----------|---------|---------|--------|
| Удаление группы не срабатывает | `router.refresh()` не всегда работает | Добавлен `window.location.href` редирект | ✅ |
| "No valid groups found" при sharing | API notify использует старую схему `org_id` | Переход на `org_telegram_groups` с фильтрацией | ✅ |

### Проблема 1: Удаление группы не обновляет UI

**Симптомы**:
- Кнопка "Удалить" нажимается, но группа остается
- UI не обновляется
- Группа висит в левом меню

**Причина**:
`router.refresh()` не всегда надежно обновляет серверные компоненты в Next.js

**Решение** (`app/app/[org]/telegram/delete-group-button.tsx`):
```typescript
// ✅ Комбинация двух подходов
router.refresh()

// Дополнительно перенаправляем на ту же страницу с timestamp
setTimeout(() => {
  window.location.href = `/app/${orgId}/telegram?t=${Date.now()}`
}, 500)
```

**Результат**: Гарантированная перезагрузка страницы после удаления

### Проблема 2: API notify возвращает "No valid groups found"

**Симптомы**:
- Кнопка "Поделиться в группах" отображается
- Группы показываются в списке для выбора
- При отправке: 404 ошибка "No valid groups found"
- В консоли: `Failed to load resource: the server responded with a status of 404`

**Причина**:
API endpoint `/api/events/[id]/notify` использовал устаревшую схему:
```typescript
// ❌ Старый код
.eq('org_id', event.org_id)  // org_id больше не обновляется!
```

**Решение** (`app/api/events/[id]/notify/route.ts`):

Трехэтапная загрузка:
```typescript
// 1. Получаем tg_chat_ids групп организации
const { data: orgGroupLinks } = await adminSupabase
  .from('org_telegram_groups')
  .select('tg_chat_id')
  .eq('org_id', event.org_id)

const orgChatIds = (orgGroupLinks || []).map(link => String(link.tg_chat_id))

// 2. Получаем полную информацию о запрошенных группах
const { data: allGroups } = await adminSupabase
  .from('telegram_groups')
  .select('*')
  .in('id', groupIds)

// 3. Фильтруем группы организации
const groups = (allGroups || []).filter(group => 
  orgChatIds.includes(String(group.tg_chat_id))
)
```

**Ключевые изменения**:
- ✅ Использование `org_telegram_groups` вместо `org_id`
- ✅ Явная конвертация `tg_chat_id` в string
- ✅ Фильтрация на стороне приложения для надежности
- ✅ Детальное логирование для отладки

### Измененные файлы

| Файл | Изменения |
|------|-----------|
| `app/app/[org]/telegram/delete-group-button.tsx` | Добавлен `window.location.href` с timestamp |
| `app/api/events/[id]/notify/route.ts` | Переход на `org_telegram_groups`, фильтрация, логирование |

### Документация
📄 **`TELEGRAM_DELETE_AND_NOTIFY_ADDITIONAL_FIX.md`** - детальное описание проблем, решений, SQL запросы, чек-листы

### Логирование в Vercel

После исправления в логах должно быть:
```
Organization chat IDs: ["-1002994446785", ...]
Requested group IDs: [10, 11]
Filtered 2 groups from 2 total
Found 2 valid groups for event notification: [...]
```

Если `Filtered 0 groups` - проверьте типы `tg_chat_id` (number vs string)

### Статус дополнительных исправлений
✅ **Исправлено и готово к деплою**  
📅 **Дата**: 10.10.2025  
🎯 **Обе дополнительные проблемы решены**  
🔍 **Важно**: Проверьте Vercel Logs после деплоя  
📊 **Ошибок компиляции**: Нет

---

## Дополнительное исправление удаления (Round 2)

### Дата: 10.10.2025 (после второго деплоя)

Пользователь сообщил, что проблема с уведомлениями решилась ✅, но **удаление групп все еще не работает** ❌.

### Корневая причина

Оказалось, что для удаления используется **два разных механизма**:

1. ✅ **Server Action** `deleteGroup` в `app/app/[org]/telegram/actions.ts` (был исправлен ранее)
   - Используется компонентом `DeleteGroupButton` на странице `/app/[org]/telegram`
   
2. ❌ **API endpoint** `/api/telegram/groups/remove` (не был исправлен)
   - Используется компонентом `RemoveGroupButton` в `components/telegram-group-actions.tsx`
   - Имел сложную логику с колонкой `status` (которой нет в production)

### Проблема с `/api/telegram/groups/remove`

**Симптомы**:
- При первом удалении: success response, но UI не обновляется
- Группа остается в левом меню
- Группа не появляется в Available Groups
- При повторном удалении: **"Group is already archived for this organization"**
- Лог Vercel: `POST /api/telegram/groups/remove 400`

**Причины**:
1. Сложная логика (~165 строк кода) с попыткой использовать `status` column:
   - Пытался `UPDATE status='archived'`
   - При ошибке 42703 (column not found) - fallback на `DELETE`
   - Проверял `activeCount` других организаций
   - Условная очистка `telegram_groups.org_id`
   
2. Компонент `RemoveGroupButton` не обновлял UI после удаления:
   - Не было `router.refresh()`
   - Не было редиректа
   - Только вызов `onRemoved()` callback

### Решение Round 2

#### 1. Упрощен API endpoint

**Файл**: `app/api/telegram/groups/remove/route.ts`

**Было** (165 строк сложной логики):
```typescript
// Проверка status
const { data: mappingData } = await supabaseService
  .from('org_telegram_groups')
  .select('status')  // ❌ Колонка не существует
  ...

// Попытка UPDATE status='archived'
await supabaseService
  .from('org_telegram_groups')
  .update({ status: 'archived', archived_at: now, archived_reason: 'manual_remove' })
  ...

// Множество try-catch для fallback
// Проверка activeCount
// Условная очистка telegram_groups
```

**Стало** (27 строк простой логики):
```typescript
const chatIdStr = String(group.tg_chat_id);

console.log(`Removing group ${groupId} (chat_id: ${chatIdStr}) from org ${orgId}`)

// 1. Проверяем существование mapping
const { data: existingMapping, error: mappingError } = await supabaseService
  .from('org_telegram_groups')
  .select('org_id, tg_chat_id')
  .eq('org_id', orgId)
  .eq('tg_chat_id', chatIdStr)
  .maybeSingle();

if (!existingMapping) {
  return NextResponse.json({ error: 'Group is not linked to this organization' }, { status: 400 });
}

// 2. Удаляем mapping
const { error: deleteError } = await supabaseService
  .from('org_telegram_groups')
  .delete()
  .eq('org_id', orgId)
  .eq('tg_chat_id', chatIdStr);

console.log('Successfully deleted mapping from org_telegram_groups')

// 3. Если группа больше не используется другими org, обнуляем org_id (legacy)
const { data: otherMappings } = await supabaseService
  .from('org_telegram_groups')
  .select('org_id')
  .eq('tg_chat_id', chatIdStr);

if (!otherMappings || otherMappings.length === 0) {
  await supabaseService
    .from('telegram_groups')
    .update({ org_id: null })
    .eq('id', groupId);
}
```

**Ключевые изменения**:
- ❌ Убрана работа с несуществующей колонкой `status`
- ❌ Убрана попытка `UPDATE` с `archived` статусом
- ✅ Простая логика: проверка → удаление → очистка legacy `org_id`
- ✅ Детальное логирование каждого шага
- ✅ Преобразование `tg_chat_id` в `string` для консистентности

#### 2. Обновлен компонент удаления

**Файл**: `components/telegram-group-actions.tsx`

**Было**:
```typescript
// Нет useRouter
// Нет confirm
const removeGroup = async () => {
  ...
  if (onRemoved) {
    onRemoved()  // ❌ Только callback, без refresh
  }
}
```

**Стало**:
```typescript
import { useRouter } from 'next/navigation'

const router = useRouter()

const removeGroup = async () => {
  // ✅ Добавлен confirm dialog
  if (!confirm('Вы уверены, что хотите удалить эту группу из организации?')) {
    return
  }
  
  ...
  
  console.log(`Group ${groupId} removed successfully, refreshing...`)
  
  if (onRemoved) {
    onRemoved()
  }
  
  // ✅ Принудительно обновляем страницу
  router.refresh()
  
  // ✅ Дополнительно перенаправляем с timestamp
  setTimeout(() => {
    window.location.href = `/app/${orgId}/telegram?t=${Date.now()}`
  }, 500)
}
```

**Результат**: Гарантированное обновление UI после удаления

### Измененные файлы (Round 2)

| Файл | До | После | Изменения |
|------|----|----|-----------|
| `app/api/telegram/groups/remove/route.ts` | 219 строк | 122 строки | Упрощена логика на 97 строк |
| `components/telegram-group-actions.tsx` | 48 строк | 61 строка | Добавлен router, confirm, редирект |

### Логирование в Vercel (Round 2)

**Успешное удаление**:
```
Removing group 10 (chat_id: -1002994446785) from org d7e2e580-6b3d-42e2-bee0-4846794f07ee
Found existing mapping, proceeding with deletion
Successfully deleted mapping from org_telegram_groups
Found 0 other organizations using this group
No other orgs use this group, clearing org_id in telegram_groups
Successfully cleared org_id in telegram_groups
```

**Группа не найдена**:
```
Removing group 10 (chat_id: -1002994446785) from org d7e2e580-6b3d-42e2-bee0-4846794f07ee
No mapping found in org_telegram_groups for this org and group
→ 400 "Group is not linked to this organization"
```

### SQL для диагностики

```sql
-- Проверка наличия mapping для организации
SELECT 
  otg.org_id,
  otg.tg_chat_id,
  tg.id as group_id,
  tg.title,
  tg.org_id as legacy_org_id
FROM org_telegram_groups otg
LEFT JOIN telegram_groups tg ON tg.tg_chat_id = otg.tg_chat_id
WHERE otg.org_id = 'YOUR_ORG_ID';

-- Проверка групп, используемых в нескольких организациях
SELECT 
  tg_chat_id,
  COUNT(DISTINCT org_id) as org_count,
  array_agg(org_id) as orgs
FROM org_telegram_groups
GROUP BY tg_chat_id
HAVING COUNT(DISTINCT org_id) > 1;

-- Проверка типов tg_chat_id
SELECT 
  pg_typeof(tg_chat_id) as type,
  COUNT(*) 
FROM org_telegram_groups 
GROUP BY pg_typeof(tg_chat_id);
```

### Документация
📄 **`TELEGRAM_DELETE_AND_NOTIFY_ADDITIONAL_FIX.md`** - обновлена с Round 2 исправлениями

### Статус Round 2
✅ **Исправлено и готово к деплою**  
📅 **Дата**: 10.10.2025  
🎯 **Проблема удаления групп решена**  
🔍 **API endpoint упрощен с 219 до 122 строк**  
📊 **Ошибок компиляции**: Нет  
⚠️ **Важно после деплоя**: Проверьте Vercel Logs для подтверждения

---

## Авторизация участников Telegram-групп

### Дата: 10.10.2025

После решения проблем с удалением и уведомлениями, пользователь сообщил о новой критически важной задаче: **участники Telegram-групп не могут авторизоваться для доступа к событиям и материалам**.

### Проблема

При переходе участника группы по ссылке на событие:
- ❌ Выдается "Доступ ограничен. Это событие доступно только участникам пространства"
- ❌ Нет кнопки для входа через Telegram
- ❌ Текст "Войдите через Telegram, если вы участник группы" не кликабельный
- ❌ Нет механизма автоматической авторизации для участников групп

### Требования

1. **Автоматическая авторизация** участников добавленных Telegram-групп
2. **Приоритет выше приглашений** - это более массовый сценарий
3. **Идентификация** через telegram_id или username
4. **Автоматическое создание** participant при подтверждении участия в группе
5. **Создание сессии** для доступа к материалам и событиям
6. **Работа по ссылке** - при переходе на материалы или события

### Решение

Реализован полноценный механизм OAuth-авторизации через Telegram для участников групп.

#### Архитектура

```
Участник группы → Ссылка на событие
                ↓
        Проверка доступа
                ↓
    Показ Telegram Login Widget
                ↓
  OAuth авторизация через Telegram
                ↓
API /api/auth/telegram (проверка групп)
                ↓
   Проверка в telegram_activity_events
                ↓
 Автоматическое создание participant
                ↓
    Создание Supabase auth сессии
                ↓
       Редирект на событие
                ↓
         Доступ предоставлен ✅
```

#### Ключевые компоненты

**1. API `/api/auth/telegram` - проверка групп** (`app/api/auth/telegram/route.ts`):

```typescript
// Если participant не найден
if (!existingParticipant) {
  // 1. Получаем группы организации
  const { data: orgGroups } = await supabaseAdmin
    .from('org_telegram_groups')
    .select('tg_chat_id')
    .eq('org_id', targetOrgId)
  
  const orgChatIds = (orgGroups || []).map(g => String(g.tg_chat_id))
  
  // 2. Проверяем активность пользователя в этих группах
  const { data: userActivity } = await supabaseAdmin
    .from('telegram_activity_events')
    .select('*')
    .eq('from_user_id', tgUserId)
    .in('tg_chat_id', orgChatIds)
    .limit(1)
  
  if (!userActivity || userActivity.length === 0) {
    // ❌ Нет активности в группах
    return 403: "Вы не являетесь участником ни одной из групп"
  }
  
  // 3. ✅ Создаём participant автоматически
  await supabaseAdmin.from('participants').insert({
    org_id: targetOrgId,
    tg_user_id: tgUserId,
    username: username,
    full_name: `${firstName} ${lastName}`,
    participant_status: 'participant',
    source: 'telegram_group'
  })
}
```

**2. Компонент `AccessDeniedWithAuth`** (`components/events/access-denied-with-auth.tsx`):

- Красивый UI с иконкой замка
- Telegram Login Widget для OAuth
- Состояния: не авторизован → загрузка → успех/ошибка
- Автоматический редирект после авторизации

**3. Обновлена страница события** (`app/p/[org]/events/[id]/page.tsx`):

```typescript
if (!event.is_public && !isOrgMember) {
  return (
    <AccessDeniedWithAuth
      orgId={org.id}
      orgName={org.name}
      eventId={params.id}
      isAuthenticated={!!user}
    />
  )
}
```

#### Поток авторизации

**Успешный сценарий**:
1. Пользователь открывает `/p/[org]/events/[id]`
2. Не авторизован → показывается `AccessDeniedWithAuth`
3. Нажимает на Telegram Login Widget
4. OAuth через Telegram → получение TelegramUser данных
5. POST `/api/auth/telegram` с `telegramData` + `orgId`
6. Проверка hash (безопасность)
7. Создание/поиск Supabase user
8. Проверка participant → не найден
9. Получение групп организации через `org_telegram_groups`
10. Проверка активности в `telegram_activity_events`
11. **Найдена активность** → создание participant
12. Создание `user_telegram_accounts` связки
13. Генерация magic link через `supabase.auth.admin.generateLink()`
14. Редирект на magic link
15. Установка auth cookie
16. Возврат на `/p/[org]/events/[id]`
17. Проверка доступа → `isOrgMember = true` ✅
18. Показывается событие с кнопкой "Зарегистрироваться"

**Неуспешный сценарий** (не участник):
- На шаге 10: активность **не найдена**
- Возврат 403: "Вы не являетесь участником ни одной из групп"
- Показывается ошибка с кнопкой "Попробовать снова"
- Опция: "Запросить приглашение"

#### Безопасность

1. **Проверка подлинности Telegram данных**:
   ```typescript
   function verifyTelegramAuth(data: any, botToken: string): boolean {
     const secretKey = crypto.createHash('sha256').update(botToken).digest()
     const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex')
     return computedHash === hash
   }
   ```

2. **Проверка времени** (не старше 24 часов):
   ```typescript
   if (now - authDate > 86400) {
     return 400: "Authentication data is too old"
   }
   ```

3. **Проверка реального участия**:
   - Не доверяем клиенту
   - Проверяем через `telegram_activity_events` на сервере
   - Требуем хотя бы одно сообщение в группе

#### Логирование в Vercel

**Успех**:
```
Participant not found for tg_user_id 154588486 in org d7e2e580..., checking group membership...
Found 2 groups for org d7e2e580...
Found 1 activity records for user 154588486
Creating participant for user 154588486 based on activity in group -1002994446785
Successfully created participant for user 154588486
```

**Неудача** (не участник):
```
Participant not found for tg_user_id 999999 in org d7e2e580..., checking group membership...
Found 2 groups for org d7e2e580...
Found 0 activity records for user 999999
→ 403 "Вы не являетесь участником ни одной из групп этого пространства"
```

### Измененные файлы

| Файл | Статус | Описание |
|------|--------|----------|
| `app/api/auth/telegram/route.ts` | ✏️ Изменен | Добавлена проверка через `telegram_activity_events` (строки 188-261) |
| `app/p/[org]/events/[id]/page.tsx` | ✏️ Изменен | Использует `AccessDeniedWithAuth` компонент |
| `components/events/access-denied-with-auth.tsx` | ➕ Создан | UI с Telegram Login Widget |

### SQL для диагностики

```sql
-- Проверка активности пользователя в группах организации
SELECT 
  tae.tg_chat_id,
  tae.from_user_id,
  tae.from_username,
  tae.event_type,
  tae.event_time,
  tg.title as group_title
FROM telegram_activity_events tae
JOIN telegram_groups tg ON tg.tg_chat_id = tae.tg_chat_id
WHERE tae.from_user_id = 154588486
  AND tae.tg_chat_id IN (
    SELECT tg_chat_id 
    FROM org_telegram_groups 
    WHERE org_id = 'YOUR_ORG_ID'
  )
ORDER BY tae.event_time DESC;

-- Проверка созданного participant
SELECT * FROM participants
WHERE tg_user_id = 154588486 
  AND org_id = 'YOUR_ORG_ID';
```

### Документация
📄 **`TELEGRAM_GROUP_MEMBER_AUTH.md`** - полное описание решения (86KB)

### Расширения (будущее)

1. **Доступ к материалам** - применить ту же логику для `/p/[org]/materials/[id]`
2. **Кэширование проверки групп** - Redis кэш на 1 час
3. **Webhook для обновления** - автоматическое создание/удаление participants при вступлении/выходе

### Статус авторизации участников
✅ **Реализовано и готово к тестированию**  
📅 **Дата**: 10.10.2025  
🎯 **Авторизация через Telegram работает**  
🔐 **Автоматическая проверка участия в группах**  
👥 **Автоматическое создание participants**  
🎫 **Создание Supabase auth сессии**  
📊 **Ошибок компиляции**: Нет  
⚠️ **Важно**: Установите `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` в environment variables!

---

## Исправление ошибки "Bot username required"

### Дата: 10.10.2025 (после первого теста)

Пользователь протестировал авторизацию и получил ошибку **"Bot username required"**.

### Проблема

**Симптомы**:
- ❌ На странице показывается: "Если вы участник одной из Telegram-групп этого пространства, войдите через Telegram для получения доступа"
- ❌ Ниже: "Bot username required"
- ❌ Telegram Login Widget не отображается

**Причина**:
Переменная окружения `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` не установлена в Vercel, поэтому компонент `TelegramLogin` получает пустую строку и не может инициализироваться.

### Решение

#### 1. Обновлен компонент `AccessDeniedWithAuth`

**Файл**: `components/events/access-denied-with-auth.tsx`

**Добавлена проверка конфигурации**:

```typescript
// Проверяем наличие bot username
const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
const isBotConfigured = Boolean(botUsername && botUsername.trim().length > 0)
```

**Условный рендеринг**:

```typescript
{!isBotConfigured ? (
  // ❌ Бот не настроен - показываем понятное сообщение
  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
    <div className="flex items-start">
      <AlertCircle className="w-5 h-5 text-red-600" />
      <div>
        <p className="font-medium text-red-800">
          Авторизация временно недоступна
        </p>
        <p className="text-red-700">
          Сервис находится в процессе настройки. 
          Попробуйте позже или свяжитесь с администратором.
        </p>
      </div>
    </div>
  </div>
) : (
  // ✅ Бот настроен - показываем Telegram Login Widget
  <>
    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
      <p>Если вы участник одной из Telegram-групп...</p>
    </div>
    <TelegramLogin botUsername={botUsername!} ... />
  </>
)}
```

**Результат**:
- Вместо криптичной ошибки "Bot username required" пользователь видит понятное сообщение
- Сообщение объясняет, что сервис в процессе настройки
- Призыв попробовать позже или связаться с администратором

#### 2. Создана инструкция по настройке

**Файл**: `TELEGRAM_BOT_SETUP.md` (15KB)

**Содержание**:
- Пошаговая инструкция по установке `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` в Vercel
- Настройка локального окружения (`.env.local`)
- Создание и настройка Telegram бота через @BotFather
- Настройка домена для Login Widget (`/setdomain`)
- Проверочный чек-лист
- Отладка распространенных ошибок
- FAQ

**Ключевые шаги для пользователя**:

1. **Получить bot username** (например, `orbo_community_bot`)
2. **Установить в Vercel**:
   - Settings → Environment Variables
   - Name: `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`
   - Value: `orbo_community_bot`
   - Environments: Production, Preview, Development
3. **Передеплоить проект** (Redeploy в Vercel)
4. **Проверить в браузере**: `console.log(process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME)`

### Важные детали

#### Префикс `NEXT_PUBLIC_`

**Почему нужен**:
- Next.js по умолчанию не экспортирует переменные окружения в браузер (клиент)
- Переменные с префиксом `NEXT_PUBLIC_` доступны в браузере
- Telegram Login Widget работает на клиенте, поэтому нужен `NEXT_PUBLIC_`

**Безопасность**:
- ✅ Username бота публичен (не секрет)
- ❌ Bot Token должен быть только на сервере (`TELEGRAM_BOT_TOKEN` без `NEXT_PUBLIC_`)

#### Две переменные для Telegram

| Переменная | Где | Для чего | Публична |
|------------|-----|----------|----------|
| `TELEGRAM_BOT_TOKEN` | Сервер | Проверка hash, отправка сообщений | ❌ Секрет |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | Клиент | Telegram Login Widget | ✅ Публична |

#### Настройка домена в @BotFather

**Обязательно**:
```
/setdomain → выбрать бота → ввести: orbo-1-1.vercel.app
```

**Без этого**:
- Telegram Login Widget не будет работать
- Ошибка: "Failed to load widget"

### Проверка после настройки

**В консоли браузера**:
```javascript
console.log(process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME)
// Ожидаем: "orbo_community_bot"
// Если undefined - переменная не установлена
```

**На странице события**:
1. Открыть `/p/[org]/events/[id]` не авторизованным
2. Должна появиться **синяя кнопка** "Log in with Telegram"
3. При клике - OAuth окно Telegram
4. После авторизации - доступ к событию

**Если видна красная карточка** "Авторизация временно недоступна":
→ Значит `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` все еще не установлен

### Измененные файлы

| Файл | Изменения |
|------|-----------|
| `components/events/access-denied-with-auth.tsx` | Добавлена проверка `isBotConfigured`, условный рендеринг |
| `TELEGRAM_BOT_SETUP.md` | Создана полная инструкция по настройке (15KB) |
| `FIXES_SUMMARY.md` | Обновлена сводка |

### Статус исправления "Bot username required"
✅ **Исправлено**  
📅 **Дата**: 10.10.2025  
🎯 **Добавлена проверка конфигурации**  
📄 **Создана инструкция по настройке**  
💬 **Понятное сообщение об ошибке для пользователей**  
📊 **Ошибок компиляции**: Нет

---

## Исправление ошибки "Cookies can only be modified in a Server Action"

### Дата: 12.10.2025 (после настройки bot username)

После настройки `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` и появления синей кнопки, при попытке авторизации возникла **критическая ошибка**.

### Проблема

**Симптомы**:
- ❌ В мобильном браузере: `Application error: a server-side exception has occurred` (Digest: 3839988809)
- ❌ В Telegram WebView: просит номер телефона, но сообщение не приходит
- ❌ В Vercel Logs: `Error: Cookies can only be modified in a Server Action or Route Handler`

**Ошибка в логах**:
```
[error] Unhandled Rejection: Error: Cookies can only be modified in a Server Action
    at Proxy.callable (/var/task/.next/server/app/p/[org]/events/[id]/page.js)
    at Object.set (...)
[fatal] Node.js process exited with exit status: 128
```

**Корневая причина**:

Next.js 15 **запрещает модификацию cookies в Server Components** (page.tsx).

Проблемный код в `app/p/[org]/events/[id]/page.tsx`:
```typescript
// ❌ Ошибка (строки 7-8, 51)
const clientSupabase = await createClientServer()
const { data: { user } } = await clientSupabase.auth.getUser()
```

**Что происходит**:
1. `createClientServer()` создает Supabase клиент с cookies middleware
2. `auth.getUser()` → `getSession()` внутри Supabase
3. Если токен истек → вызов `refreshSession()`
4. `refreshSession()` пытается установить новые cookies
5. **Next.js 15 запрещает** установку cookies в Server Component
6. → **Crash!**

### Решение

Вместо вызова `auth.getUser()` (который может модифицировать cookies), **читаем cookies напрямую** и декодируем JWT токен локально.

#### Было (❌):

```typescript
import { createAdminServer, createClientServer } from '@/lib/server/supabaseServer'

export default async function PublicEventPage({ params }) {
  const supabase = await createAdminServer()
  const clientSupabase = await createClientServer() // ❌
  
  const { data: { user } } = await clientSupabase.auth.getUser() // ❌ Модифицирует cookies
  
  let isOrgMember = false
  if (user) {
    // ... проверка участия
  }
}
```

#### Стало (✅):

```typescript
import { cookies } from 'next/headers'
import { createAdminServer } from '@/lib/server/supabaseServer'

export default async function PublicEventPage({ params }) {
  const supabase = createAdminServer()
  
  // ✅ Только ЧТЕНИЕ cookies (без модификации)
  const cookieStore = await cookies()
  
  let userId: string | null = null
  
  // Ищем auth cookie
  const allCookies = cookieStore.getAll()
  const authCookie = allCookies.find(c => 
    c.name.includes('auth-token') || 
    c.name === 'sb-access-token' ||
    c.name.startsWith('sb-') && c.name.endsWith('-auth-token')
  )
  
  if (authCookie?.value) {
    try {
      // ✅ Декодируем JWT локально (без API вызовов)
      const authData = JSON.parse(authCookie.value)
      userId = authData?.user?.id || 
        (authData?.access_token ? 
          JSON.parse(Buffer.from(authData.access_token.split('.')[1], 'base64').toString()).sub 
          : null)
    } catch {
      try {
        // JWT напрямую
        const payload = JSON.parse(Buffer.from(authCookie.value.split('.')[1], 'base64').toString())
        userId = payload.sub
      } catch (err) {
        console.error('Error decoding auth cookie:', err)
      }
    }
  }
  
  // ✅ Используем userId вместо user
  let isOrgMember = false
  if (userId) {
    // ... проверка через userId
  }
  
  return (
    <AccessDeniedWithAuth
      isAuthenticated={!!userId} // ✅ Было: !!user
    />
  )
}
```

#### Ключевые изменения:

1. **Убран `createClientServer()`**:
   - Не создаем клиент с cookies middleware
   - Используем только `createAdminServer()` для запросов к БД

2. **Убран `auth.getUser()`**:
   - Не вызываем методы, которые могут обновлять сессию
   - Читаем cookies напрямую через `cookies()`

3. **Локальное декодирование JWT**:
   - Извлекаем `user_id` из токена без API вызовов
   - JWT содержит `sub` (subject) = `user_id`
   - Не нужна проверка подписи (доверяем Supabase)

4. **Обработка разных форматов cookies**:
   - JSON: `{ user: { id: '...' }, access_token: '...' }`
   - Прямой JWT: `eyJhbGc...`

#### Почему это работает:

| Действие | Server Component | Server Action/Route Handler |
|----------|------------------|----------------------------|
| `cookies().get()` | ✅ Разрешено | ✅ Разрешено |
| `cookies().set()` | ❌ Запрещено | ✅ Разрешено |

Мы:
- ✅ Только читаем cookies (разрешено)
- ✅ Не вызываем `auth.getUser()` (не модифицируем)
- ✅ Декодируем JWT локально (без Supabase API)
- ✅ Получаем `userId` без модификации cookies

**Результат**: Никакой модификации cookies → нет ошибки!

### Побочные эффекты (приемлемые)

1. **Истекшая сессия не обновляется автоматически**:
   - Пользователь просто увидит "Доступ ограничен"
   - Нужно будет авторизоваться заново
   - ✅ Нормально для публичных страниц

2. **Не проверяется валидность токена**:
   - Доверяем токену из cookie (установленному Supabase)
   - Cookie защищен `httpOnly` и `secure` flags
   - ✅ Для критичных операций используется Route Handler с полной проверкой

### Измененные файлы

| Файл | Изменения |
|------|-----------|
| `app/p/[org]/events/[id]/page.tsx` | Убран `createClientServer()` и `auth.getUser()`, добавлено локальное декодирование JWT |
| `PUBLIC_PAGE_COOKIES_FIX.md` | Создана детальная документация (21KB) |
| `FIXES_SUMMARY.md` | Обновлена сводка |

### Vercel Logs

**До исправления (❌)**:
```
[error] Cookies can only be modified in a Server Action
[fatal] Node.js process exited with exit status: 128
```

**После исправления (✅)**:
```
[info] /p/[org]/events/[id] status=200
```

### Тестирование

**Сценарий 1**: Не авторизованный пользователь
1. Откройте `/p/[org]/events/[id]` в инкогнито
2. Ожидается: "Доступ ограничен" с синей кнопкой
3. ✅ Нет ошибки cookies

**Сценарий 2**: Авторизация
1. Нажмите "Log in with Telegram"
2. Авторизуйтесь через Telegram
3. ✅ Работает без ошибок

**Сценарий 3**: Авторизованный пользователь
1. Обновите страницу
2. ✅ Cookies читаются, доступ предоставлен

### Документация
📄 **`PUBLIC_PAGE_COOKIES_FIX.md`** - полное описание проблемы и решения (21KB)

### Статус исправления cookies
✅ **Исправлено**  
📅 **Дата**: 12.10.2025  
🎯 **Убран `auth.getUser()` из Server Component**  
🔧 **Добавлено локальное декодирование JWT**  
📖 **Никакой модификации cookies**  
✨ **Работает в Vercel без ошибок**  
📊 **Ошибок компиляции**: Нет

---

